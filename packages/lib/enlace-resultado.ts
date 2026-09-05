/**
 * Acortador de enlaces + armado de mensajes para enviar resultados al paciente
 * (GUR-18).
 *
 * Todo lo de acá es puro: generar el slug, normalizar el teléfono a formato
 * WhatsApp y componer los textos. El acceso a datos vive en
 * `@labo/db/repos/enlaces` y el envío en `@labo/lib/server/email`.
 */

const ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Largo del slug: 10 chars base62 ≈ 59 bits de entropía. */
export const SLUG_LENGTH = 10;

export const SLUG_PATTERN = /^[0-9A-Za-z]{10}$/;

/** Prefijo país por defecto (Venezuela) para números locales sin código. */
const PREFIJO_PAIS_VE = "58";

/**
 * Slug aleatorio criptográfico. La URL corta ES la credencial de acceso al
 * resultado, así que no puede derivarse del id de la orden ni de un contador.
 *
 * Se descartan los bytes >= 248 para que el módulo 62 quede uniforme (248 es
 * el mayor múltiplo de 62 que entra en un byte).
 */
export function generarSlug(length: number = SLUG_LENGTH): string {
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= 248) continue; // ponytail: rechazo simple, sesgo cero
      out += ALFABETO[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Normaliza un teléfono al formato que espera `wa.me`: solo dígitos, con
 * código de país y sin `+`.
 *
 * Acepta lo que realmente hay cargado en `pacientes.telefono`:
 *   `0414-1234567` → `584141234567`
 *   `+58 412 1234567` → `584121234567`
 *   `4141234567` → `584141234567`
 *
 * Devuelve `null` si no se puede armar un número plausible: en ese caso el
 * botón de WhatsApp queda deshabilitado en vez de abrir un chat inexistente.
 */
export function normalizarTelefonoWhatsApp(
  telefono: string | null | undefined,
  prefijoPais: string = PREFIJO_PAIS_VE,
): string | null {
  if (!telefono) return null;

  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length === 0) return null;

  // Ya viene con código de país venezolano: 58 + 10 dígitos.
  if (digitos.startsWith(prefijoPais) && digitos.length === prefijoPais.length + 10) {
    return digitos;
  }
  // Formato nacional con 0 inicial: 0414-1234567.
  if (digitos.startsWith("0") && digitos.length === 11) {
    return `${prefijoPais}${digitos.slice(1)}`;
  }
  // Nacional sin 0: 4141234567.
  if (digitos.length === 10) {
    return `${prefijoPais}${digitos}`;
  }
  // Internacional de otro país (ya trae su código): lo dejamos pasar tal cual.
  if (digitos.length >= 11 && digitos.length <= 15) {
    return digitos;
  }
  return null;
}

export interface MensajeResultadoInput {
  /** Nombre de pila del paciente, para el saludo. */
  paciente: string;
  /** Nombre del laboratorio (de `laboratorio_config.nombre`). */
  laboratorio: string;
  /** URL corta pública del resultado. */
  url: string;
  /** Fecha de vencimiento del enlace, ya formateada para mostrar. */
  vence?: string | null;
}

/** Texto plano del mensaje de WhatsApp. Tono formal, sin datos clínicos. */
export function mensajeWhatsApp(input: MensajeResultadoInput): string {
  const vigencia = input.vence
    ? `\n\nPor su seguridad, el enlace es personal y estará disponible hasta el ${input.vence}.`
    : "\n\nPor su seguridad, el enlace es personal y tiene una vigencia limitada.";

  return (
    `Estimado/a ${input.paciente}, le saluda ${input.laboratorio}.\n\n` +
    `Sus resultados de laboratorio ya se encuentran disponibles. ` +
    `Puede consultarlos en el siguiente enlace:\n${input.url}` +
    vigencia +
    `\n\nAnte cualquier duda sobre sus resultados, consulte con su médico tratante. Quedamos a su disposición.`
  );
}

/** Link `wa.me` listo para abrir con el mensaje precargado. */
export function enlaceWhatsApp(telefonoNormalizado: string, mensaje: string): string {
  return `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Link `mailto:` con asunto y cuerpo precargados, para que el operador mande
 * el correo desde su propia cuenta.
 *
 * Es el mismo trato que `enlaceWhatsApp`: el sistema arma el mensaje, la
 * persona lo dispara. Se usa cuando el envío server-side no está disponible
 * (ver `EMAIL_NO_DISPONIBLE` en `@labo/lib/server/email`).
 */
export function mailtoResultado(email: string, input: MensajeResultadoInput): string {
  const params = new URLSearchParams({
    subject: asuntoEmail(input.laboratorio),
    body: mensajeWhatsApp(input),
  });
  // URLSearchParams codifica el espacio como "+", que en el cuerpo de un
  // mailto se muestra literal. RFC 6068 pide %20.
  return `mailto:${encodeURIComponent(email)}?${params.toString().replace(/\+/g, "%20")}`;
}

export function asuntoEmail(laboratorio: string): string {
  return `Resultados de laboratorio disponibles — ${laboratorio}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cuerpo HTML del email. Mismo tono que el de WhatsApp. */
export function htmlEmail(input: MensajeResultadoInput): string {
  const paciente = escapeHtml(input.paciente);
  const laboratorio = escapeHtml(input.laboratorio);
  const url = escapeHtml(input.url);
  const vigencia = input.vence
    ? `El enlace es personal y estará disponible hasta el ${escapeHtml(input.vence)}.`
    : "El enlace es personal y tiene una vigencia limitada.";

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">
      <p style="margin: 0 0 12px;">Estimado/a ${paciente},</p>
      <p style="margin: 0 0 12px;">
        Le saluda <strong>${laboratorio}</strong>. Sus resultados de laboratorio ya se encuentran disponibles.
      </p>
      <p style="margin: 0 0 20px;">
        <a href="${url}" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600;">
          Ver mis resultados
        </a>
      </p>
      <p style="margin: 0 0 12px; font-size: 12px; color: #64748b;">
        Si el botón no funciona, copie y pegue esta dirección en su navegador:<br />
        <span style="word-break: break-all;">${url}</span>
      </p>
      <p style="margin: 0 0 12px; font-size: 12px; color: #64748b;">${vigencia}</p>
      <p style="margin: 0; font-size: 12px; color: #64748b;">
        Ante cualquier duda sobre sus resultados, consulte con su médico tratante. Quedamos a su disposición.
      </p>
    </div>
  `;
}
