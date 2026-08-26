/**
 * Mapeo de errores conocidos → mensajes legibles (voz LabSystem, español VE).
 *
 * Códigos de dominio (lanzados como `new Error(CODIGO)` en `packages/convex/*`)
 * y códigos PG (23505 unique_violation / 23503 foreign_key_violation) que llegan
 * desde Postgres/PostgREST en el backend InsForge (ADR-11).
 *
 * ADR-08: `@labo/lib` es paquete hoja — no importa de nadie.
 */

/**
 * Códigos de dominio → mensaje humano.
 *
 * Fuentes:
 * - `packages/convex/helpers/auth.ts` (UNAUTHENTICATED, UNAUTHORIZED)
 * - `packages/convex/examenes.ts` (TITULO_*)
 * - `packages/convex/config.ts` (ASSET_*)
 * - `packages/convex/exports.ts` (STORAGE_NO_ENCONTRADO)
 * - Códigos de dominio planificados en F2/F3 (CEDULA_DUPLICADA, etc.).
 */
export const DOMAIN_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  // ── Auth ──────────────────────────────────────────────────────────────
  UNAUTHENTICATED: "Tu sesión expiró. Ingresá de nuevo.",
  UNAUTHORIZED: "No tenés permisos para realizar esta acción.",
  CREDENCIALES_INVALIDAS: "Correo o contraseña incorrectos.",

  // ── Exámenes (packages/convex/examenes.ts) ────────────────────────────
  TITULO_DUPLICADO: "Ya existe un examen con ese título.",
  TITULO_NO_ENCONTRADO: "El examen que buscás ya no existe.",
  TITULO_TIENE_EXAMENES:
    "No se puede eliminar el título porque tiene exámenes asociados.",

  // ── Config (packages/convex/config.ts) ────────────────────────────────
  ASSET_NO_ENCONTRADO: "El recurso que intentás usar ya no existe.",
  ASSET_MIME_INVALIDO: "El tipo de archivo no está permitido.",
  ASSET_TAMANO_EXCEDIDO: "El archivo supera el tamaño máximo permitido.",

  // ── Exports (packages/convex/exports.ts) ──────────────────────────────
  STORAGE_NO_ENCONTRADO: "No se encontró el archivo exportado.",

  // ── Pacientes (F2.pacientes) ──────────────────────────────────────────
  CEDULA_DUPLICADA: "Ya existe un paciente con esa cédula.",
  CEDULA_INVALIDA: "El formato de la cédula no es válido.",
  PACIENTE_NO_ENCONTRADO: "El paciente que buscás ya no existe.",
  SEXO_REQUERIDO: "El sexo biológico es requerido (M o F).",

  // ── Presupuestos / Resultados / Paquetes (F2, F3) ─────────────────────
  PRESUPUESTO_NO_ENCONTRADO: "El presupuesto que buscás ya no existe.",
  PRESUPUESTO_YA_CONVERTIDO:
    "Este presupuesto ya fue convertido en resultado.",
  PRESUPUESTO_VENCIDO: "El presupuesto venció y ya no se puede utilizar.",
  RESULTADO_NO_ENCONTRADO: "El resultado que buscás ya no existe.",
  RESULTADO_DUPLICADO: "Ya existe un resultado para esa muestra y examen.",
  PAQUETE_NO_ENCONTRADO: "El paquete que buscás ya no existe.",
  PAQUETE_DUPLICADO: "Ya existe un paquete con ese nombre.",
  PAQUETE_EN_USO:
    "El paquete no se puede eliminar porque tiene presupuestos asociados.",
  EXAMEN_NO_ENCONTRADO: "El examen que buscás ya no existe.",

  // ── General ───────────────────────────────────────────────────────────
  VALIDACION_FALLIDA: "Revisá los datos ingresados e intentá de nuevo.",
  ERROR_GENERICO: "Algo salió mal. Intentá de nuevo.",
} as const;

/**
 * Códigos PG → mensaje humano genérico (cuando no hay `constraint` conocido).
 *
 * `23505` = unique_violation, `23503` = foreign_key_violation.
 */
export const PG_ERROR_CODE_MESSAGES: Readonly<Record<string, string>> = {
  "23505": "Ya existe un registro con esos datos.",
  "23503":
    "Este registro está en uso y no se puede eliminar ni modificar.",
} as const;

/**
 * Constraint PG conocido → mensaje específico (schema.sql de `packages/db`).
 * Tiene prioridad sobre `PG_ERROR_CODE_MESSAGES`.
 */
export const PG_CONSTRAINT_MESSAGES: Readonly<Record<string, string>> = {
  pacientes_cedula_unique: "Ya existe un paciente con esa cédula.",
  examenes_titulos_nombre_unique: "Ya existe un examen con ese título.",
  examenes_titulo_nombre_unique: "Ya existe un examen con ese nombre.",
  paquetes_nombre_unique: "Ya existe un paquete con ese nombre.",
  usuarios_email_unique: "Ya existe un usuario con ese correo.",
  migration_map_wp_unique: "El registro ya fue migrado.",
} as const;

/**
 * Mensajes que ya llegan como texto libre (Convex/Route Handler) y queremos
 * normalizar a la voz del producto.
 */
export const KNOWN_FREE_TEXT_MESSAGES: Readonly<Record<string, string>> = {
  "credenciales inválidas": "Correo o contraseña incorrectos.",
} as const;

/** Patrón de un código de dominio: mayúsculas + `_` (p.ej. CEDULA_DUPLICADA). */
const DOMAIN_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const GENERIC_MESSAGE = DOMAIN_ERROR_MESSAGES.ERROR_GENERICO;

function isConvexError(value: unknown): value is { data: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    (value as { name?: unknown }).name === "ConvexError" &&
    "data" in value
  );
}

function isPgError(value: unknown): value is {
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code?: unknown }).code === "string" &&
    /^\d{5}$/.test((value as { code: string }).code)
  );
}

function isHttpResponseError(
  value: unknown,
): value is { status?: unknown; statusText?: unknown; message?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as { status?: unknown }).status === "number"
  );
}

function isZodLikeError(
  value: unknown,
): value is { issues?: { message?: unknown }[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "issues" in value &&
    Array.isArray((value as { issues?: unknown }).issues)
  );
}

function isErrorInstance(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Extrae el texto crudo del error (mensaje, código o data de ConvexError).
 * Devuelve `undefined` si no hay texto aprovechable.
 */
export function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (isConvexError(value)) {
    const inner = extractErrorMessage(value.data);
    if (inner !== undefined) return inner;
    return undefined;
  }
  if (isErrorInstance(value)) return value.message;
  if (isPgError(value)) return undefined; // se resuelve por código/constraint
  if (isHttpResponseError(value)) {
    const text =
      typeof value.message === "string" ? value.message : undefined;
    if (text) return text;
    return value.status ? String(value.status) : undefined;
  }
  if (isZodLikeError(value)) {
    const first = value.issues?.[0]?.message;
    if (typeof first === "string") return first;
    return undefined;
  }
  if (typeof value === "object" && value !== null) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

/**
 * Resuelve un mensaje humano para cualquier error conocido.
 *
 * Orden de resolución:
 * 1. Texto libre ya conocido (`KNOWN_FREE_TEXT_MESSAGES`).
 * 2. Código de dominio (`DOMAIN_ERROR_MESSAGES`).
 * 3. PG: constraint específico → código PG genérico.
 * 4. Texto libre que parece código (upper + `_`) → genérico.
 * 5. Texto libre común → se devuelve tal cual (ya es legible).
 * 6. Fallback genérico.
 */
export function toHumanError(
  error: unknown,
  fallback = GENERIC_MESSAGE,
): string {
  if (error === null || error === undefined) return fallback;

  const raw = extractErrorMessage(error);

  if (isPgError(error)) {
    const constraint =
      typeof error.constraint === "string" ? error.constraint : undefined;
    if (constraint && constraint in PG_CONSTRAINT_MESSAGES) {
      return PG_CONSTRAINT_MESSAGES[constraint];
    }
    const code = typeof error.code === "string" ? error.code : undefined;
    if (code && code in PG_ERROR_CODE_MESSAGES) {
      return PG_ERROR_CODE_MESSAGES[code];
    }
    if (raw) return raw;
    return fallback;
  }

  if (typeof raw !== "string" || raw.length === 0) return fallback;

  if (raw in KNOWN_FREE_TEXT_MESSAGES) {
    return KNOWN_FREE_TEXT_MESSAGES[raw];
  }
  if (raw in DOMAIN_ERROR_MESSAGES) {
    return DOMAIN_ERROR_MESSAGES[raw];
  }
  if (DOMAIN_CODE_PATTERN.test(raw)) {
    // Código de dominio desconocido (posible evolución futura) → genérico.
    return fallback;
  }
  return raw;
}

/**
 * Detecta errores de sesión (401 / UNAUTHENTICATED) para redirigir a login.
 *
 * NO considera `UNAUTHORIZED` (403: sesión activa, rol insuficiente).
 */
export function isUnauthorizedError(error: unknown): boolean {
  if (isHttpResponseError(error) && error.status === 401) return true;

  const raw = extractErrorMessage(error);
  if (typeof raw !== "string") return false;

  if (raw === "UNAUTHENTICATED" || raw === "401") return true;
  if (raw === "Unauthorized") return true; // Route Handler plain-text 401
  if (/not authenticated|sesión expir/i.test(raw)) return true;

  return false;
}

/**
 * Maneja un error proveniente de un fetch/mutation del lado cliente.
 *
 * Si el error es de sesión (401), redirige a `/` (única vez) y devuelve
 * el mensaje humano. Caso contrario devuelve `toHumanError(error)`.
 *
 * SSR-safe: si no hay `window` (server), sólo devuelve el mensaje.
 */
export function handleRequestError(
  error: unknown,
  opts?: { onUnauthorized?: () => void },
): string {
  if (isUnauthorizedError(error)) {
    if (typeof window !== "undefined" && !sessionStorage.getItem("labo:redirecting")) {
      sessionStorage.setItem("labo:redirecting", "1");
      opts?.onUnauthorized?.();
      window.location.assign("/");
    }
    return DOMAIN_ERROR_MESSAGES.UNAUTHENTICATED;
  }
  return toHumanError(error);
}
