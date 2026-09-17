/**
 * Formatea el número correlativo de una orden (resultado) para trato con clientes.
 *
 * Formato: `RS-{año}-{numero_padded_6}` — ej. `RS-2026-000127`.
 *
 * El año se saca de `created_at` (no del calendario actual) para que la
 * numeración quede estable al mostrar órdenes históricas.
 */
export function formatNumeroOrden(
  numeroCorrelativo: number,
  createdAt: Date | string,
): string {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const year = Number.isNaN(d.getTime()) ? new Date().getUTCFullYear() : d.getUTCFullYear();
  return `RS-${year}-${String(numeroCorrelativo).padStart(6, "0")}`;
}

const NUMERO_ORDEN_CON_PREFIJO = /^rs-\d{4}-(\d+)$/i;

/**
 * Extrae el número correlativo de un término de búsqueda.
 *
 * Acepta el formato completo (`RS-2026-000123`, sin importar mayúsculas),
 * sólo dígitos con o sin ceros a la izquierda (`000123`, `123`). El año del
 * prefijo no se valida contra nada: sólo sirve para reconocer el formato,
 * la búsqueda es por `numero_correlativo`.
 *
 * Devuelve `null` si el término no es un número de orden (ej. un apellido).
 */
export function parseNumeroOrden(term: string): number | null {
  const trimmed = term.trim();
  const match = trimmed.match(NUMERO_ORDEN_CON_PREFIJO);
  const digits = match ? match[1]! : trimmed;
  if (!/^\d+$/.test(digits)) return null;
  const numero = Number(digits);
  return numero > 0 ? numero : null;
}
