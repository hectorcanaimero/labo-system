-- =============================================================================
-- 0022 — paquetes.activo: borrado lógico
--
-- Contexto:
--   `DELETE /api/paquetes/[id]` borraba la fila física, y `paquetes_examenes`
--   / `presupuestos_examenes.paquete_id` (`0007`) referencian `paquetes` con
--   `ON DELETE RESTRICT`: borrar un paquete que ya aparece en una línea de
--   presupuesto fallaba con 500. Pasamos a borrado lógico, igual que exámenes
--   (`examenes.activo`) y pacientes.
--
--   `list` solo devuelve paquetes activos. `getById` sigue devolviendo
--   inactivos, porque los presupuestos viejos los muestran.
-- =============================================================================

ALTER TABLE paquetes
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
