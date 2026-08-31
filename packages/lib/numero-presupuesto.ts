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
