/**
 * Formatea el número correlativo de un presupuesto para trato con clientes.
 *
 * Formato: `PR-{año}-{numero_padded_6}` — ej. `PR-2026-000127`.
 *
 * El año se saca de `created_at` (no del calendario actual) para que la
 * numeración quede estable al mostrar presupuestos históricos.
 */
export function formatNumeroPresupuesto(
  numeroCorrelativo: number,
  createdAt: Date | string,
): string {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const year = Number.isNaN(d.getTime()) ? new Date().getUTCFullYear() : d.getUTCFullYear();
  return `PR-${year}-${String(numeroCorrelativo).padStart(6, "0")}`;
}

/**
 * Extrae el `numero_correlativo` de un término de búsqueda.
 *
 * Acepta el número formateado completo (`PR-2026-000123`, sin importar
 * mayúsculas ni ceros a la izquierda tras el año) o el número pelado
 * (`000123`, `123`). Cualquier otra cosa (nombre, cédula) devuelve `null`.
 */
export function parseNumeroPresupuesto(term: string): number | null {
  const trimmed = term.trim();
  if (!trimmed) return null;
  const conPrefijo = /^pr-\d{4}-(\d+)$/i.exec(trimmed);
  const digitos = conPrefijo ? conPrefijo[1] : (/^\d+$/.test(trimmed) ? trimmed : null);
  if (digitos === null) return null;
  const n = Number(digitos);
  return Number.isInteger(n) && n > 0 ? n : null;
}
