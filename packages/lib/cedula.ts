export class InvalidCedulaError extends Error {
  constructor(raw: string) {
    super(`Cédula inválida: "${raw}"`);
    this.name = "InvalidCedulaError";
  }
}

const VALID_PREFIXES = new Set(["V", "E", "J", "G", "P"]);
const CEDULA_RE = /^([VEJGP]?)[-\s.]*(\d{5,9})$/i;

export function normalizeCedula(raw: string): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const cleaned = trimmed.toUpperCase().replace(/[\s.]/g, "");

  const match = CEDULA_RE.exec(cleaned);
  if (!match) return null;

  const prefix = match[1] || "V";
  const digits = match[2];

  if (!VALID_PREFIXES.has(prefix)) return null;

  return `${prefix}-${digits}`;
}

export function normalizeCedulaOrThrow(raw: string): string {
  const result = normalizeCedula(raw);
  if (result === null) throw new InvalidCedulaError(raw);
  return result;
}

/**
 * Enmascara una cédula dejando visibles sólo los dos últimos dígitos, con los
 * grupos de miles que tendría al mostrarse completa
 * (`V-12345678` → `V-**.***.*78`).
 *
 * Falla CERRADO: si el valor no tiene el formato normalizado esperado, se
 * devuelve una máscara sin dígitos en vez del valor original. Es una función
 * cuyo único propósito es no filtrar el dato, así que ante una entrada que no
 * entiende no puede optar por mostrarla.
 */
export function enmascararCedula(cedula: string | null | undefined): string {
  if (typeof cedula !== "string" || cedula.trim().length === 0) return "—";

  const match = /^([VEJGP])-(\d+)$/.exec(cedula.trim());
  if (!match) return "***";

  const [, prefijo, digitos] = match;

  const largos: number[] = [];
  let resto = digitos.length;
  while (resto > 3) {
    largos.unshift(3);
    resto -= 3;
  }
  largos.unshift(resto);

  const visibles = Math.min(2, digitos.length);
  const enmascarada =
    "*".repeat(digitos.length - visibles) + digitos.slice(digitos.length - visibles);

  const grupos: string[] = [];
  let cursor = 0;
  for (const largo of largos) {
    grupos.push(enmascarada.slice(cursor, cursor + largo));
    cursor += largo;
  }

  return `${prefijo}-${grupos.join(".")}`;
}
