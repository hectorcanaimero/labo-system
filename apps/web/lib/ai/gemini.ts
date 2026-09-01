// Cliente Gemini para el asistente de redacción de observaciones clínicas.
//
// Modelo: gemini-2.5-flash-lite (AI Studio directo, no OpenRouter).
// Free tier: 1500 req/día, 15 RPM — cubre operación normal del lab.
//
// Contrato del módulo:
//   - `sugerirObservacion(texto)` recibe el borrador del bioanalista y
//     devuelve una versión reescrita en registro técnico venezolano.
//   - Antes de mandar a Google, se sanitizan PII venezolanas (cédula,
//     teléfono, email) como defensa en profundidad. El sistema NO debería
//     poner nombres del paciente en este campo, pero si se filtra se anonimiza.
//   - Timeout duro 15s. Errores tipificados para respuesta 4xx/5xx apropiada.
//   - Feature flag: `AI_OBSERVACIONES_ENABLED=true`. Con `false` el helper
//     `isAiObservacionesEnabled()` devuelve false y el endpoint responde 503.

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash-lite";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_INPUT_CHARS = 2_000;
const MAX_OUTPUT_TOKENS = 400;

const SYSTEM_PROMPT = `Eres licenciada en bioanálisis venezolana con más de 15 años de experiencia clínica en Caracas. Tu tarea es reescribir observaciones para el informe de un resultado de laboratorio dirigido al paciente y al médico solicitante.

Reglas obligatorias:
- Registro: formal técnico venezolano. Usa forma impersonal o pasiva ("se sugiere", "se recomienda", "se observa", "se procesó según protocolo"). NO uses "sos" ni voseo — eso es rioplatense. Si necesitas dirigirte a alguien, usa tuteo ("tú").
- Léxico venezolano: "estudio de laboratorio" (no "análisis clínico"), "consulta médica" (no "turno médico"), "informe" (no "reporte"), "muestra" (no "espécimen").
- Nunca alarmar al paciente: evita "peligroso", "grave", "urgente", "crítico", "anormal". Usa neutros: "fuera del rango de referencia", "amerita seguimiento", "se sugiere reevaluación".
- Nunca diagnostiques: no menciones patologías. Usa: "se sugiere evaluación por el médico tratante", "se recomienda correlacionar con la clínica del paciente".
- Preserva valores numéricos y unidades exactamente como aparecen en el texto original.
- Corrige ortografía y sintaxis; mantén la intención clínica del bioanalista.
- Máximo 3-4 oraciones. Devuelve solo el texto reescrito, sin preámbulos, comillas ni marcadores.

Ejemplo 1
Input: "los valores de glucosa salieron altos, como 145, hay que ver eso urgente"
Output: Se observó un valor de glucosa de 145 mg/dL, fuera del rango de referencia. Se sugiere evaluación por el médico tratante para correlacionar con la clínica del paciente y establecer conducta a seguir.

Ejemplo 2
Input: "muestra medio hemolizada, pudo afectar el potasio"
Output: La muestra presentó hemólisis leve durante el procesamiento, condición que puede alterar los valores de potasio sérico. Se recomienda considerar este hallazgo en la interpretación del resultado.`;

export type AiErrorCode =
  | "AI_DISABLED"
  | "AI_MISCONFIGURED"
  | "AI_INPUT_INVALID"
  | "AI_UPSTREAM_ERROR"
  | "AI_TIMEOUT"
  | "AI_EMPTY_RESPONSE";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly cause?: unknown;
  constructor(code: AiErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = "AiError";
  }
}

export interface SugerenciaResult {
  sugerencia: string;
  modelo: string;
  latencyMs: number;
  inputChars: number;
  outputChars: number;
}

export function isAiObservacionesEnabled(): boolean {
  return process.env.AI_OBSERVACIONES_ENABLED === "true";
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiError("AI_MISCONFIGURED", "GEMINI_API_KEY no está configurada.");
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

// Sanitiza PII venezolana antes de enviar a Google. Defensa en profundidad:
// el campo observaciones NO debería contener estos datos, pero si se filtran
// se anonimizan aquí.
const REGEX_CEDULA_VE = /\b[VEJPGvejpg]-?\d{6,9}\b/g;
const REGEX_TEL_INTL = /\+?58[\s-]?\d{3}[\s-]?\d{7}/g;
const REGEX_TEL_LOCAL = /\b0\d{3}[\s-]?\d{7}\b/g;
const REGEX_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function sanitizePii(input: string): string {
  return input
    .replace(REGEX_EMAIL, "[email]")
    .replace(REGEX_CEDULA_VE, "[cédula]")
    .replace(REGEX_TEL_INTL, "[teléfono]")
    .replace(REGEX_TEL_LOCAL, "[teléfono]");
}

export async function sugerirObservacion(rawInput: string): Promise<SugerenciaResult> {
  if (!isAiObservacionesEnabled()) {
    throw new AiError("AI_DISABLED", "El asistente de observaciones está deshabilitado.");
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new AiError("AI_INPUT_INVALID", "El texto está vacío.");
  }
  if (trimmed.length > MAX_INPUT_CHARS) {
    throw new AiError(
      "AI_INPUT_INVALID",
      `El texto supera el máximo permitido (${MAX_INPUT_CHARS} caracteres).`,
    );
  }

  const sanitized = sanitizePii(trimmed);
  const ai = getClient();
  const started = Date.now();

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: MODEL,
        contents: sanitized,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.4,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new AiError("AI_TIMEOUT", "Gemini superó el timeout de 15s.")),
          REQUEST_TIMEOUT_MS,
        ),
      ),
    ]);

    const text = (response.text ?? "").trim();
    if (!text) {
      throw new AiError("AI_EMPTY_RESPONSE", "Gemini devolvió una respuesta vacía.");
    }

    return {
      sugerencia: text,
      modelo: MODEL,
      latencyMs: Date.now() - started,
      inputChars: sanitized.length,
      outputChars: text.length,
    };
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError(
      "AI_UPSTREAM_ERROR",
      err instanceof Error ? err.message : "Error desconocido del proveedor.",
      err,
    );
  }
}
