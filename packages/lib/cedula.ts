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
