/**
 * Lectura del vencimiento de un JWT sin verificar la firma.
 *
 * Sirve sólo para decidir si conviene renovar el access token antes de usarlo:
 * la verificación real la hace InsForge en cada request. Nunca confiar en el
 * payload para autorizar nada.
 */

export type DecisionRenovacion = "vigente" | "renovar" | "sin-exp";

/** `exp` del JWT en milisegundos, o `null` si el token no trae uno legible. */
export function leerExpJwt(token: string): number | null {
  const partes = token.split(".");
  if (partes.length < 2) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const relleno = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = decodeBase64(relleno);
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : null;
  } catch {
    return null;
  }
}

function decodeBase64(b64: string): string {
  // Edge runtime (middleware) tiene `atob`; Node también desde la 16.
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

/**
 * Decide si el access token debe renovarse: cuando ya venció o vence en
 * menos de `margenMs` (default 5 minutos). Sin `exp` legible no se puede
 * decidir y se deja pasar: InsForge lo rechazará si corresponde.
 */
export function decidirRenovacion(
  token: string,
  ahoraMs: number = Date.now(),
  margenMs: number = 5 * 60 * 1000,
): DecisionRenovacion {
  const exp = leerExpJwt(token);
  if (exp === null) return "sin-exp";
  return exp - ahoraMs <= margenMs ? "renovar" : "vigente";
}
