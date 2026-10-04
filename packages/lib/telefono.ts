/**
 * Máscara visual de teléfono VE: `+58 412-1234567` (internacional) o
 * `0412-1234567` (nacional). Tolerante a tipeo parcial.
 */
export function formatTelefonoVeMask(raw: string): string {
  const plus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!plus && digits.startsWith("0")) {
    const national = digits.slice(0, 11);
    const head = national.slice(0, 4);
    const tail = national.slice(4);
    return `${head}${tail ? `-${tail}` : ""}`;
  }
  // "+", "+5", "+58": código de país a medio escribir (o borrando).
  if (plus && "58".startsWith(digits)) return `+${digits}`;
  // Sin 0 inicial se asume móvil/fijo VE sin código de país: `4241234567` y
  // `+58 424-1234567` (o pegado encima de un "+58 " ya escrito) dan lo mismo.
  const rest = digits.replace(/^(58)+/, "").replace(/^0/, "").slice(0, 10);
  if (!rest) return digits;
  const head = rest.slice(0, 3);
  const tail = rest.slice(3);
  return `+58 ${head}${tail ? `-${tail}` : ""}`;
}
