-- =============================================================================
-- 0025 — examenes_titulos.activo: archivado lógico de grupos
--
-- Contexto:
--   `DELETE /api/examenes/titulos/[id]` borraba la fila física, pero los
--   exámenes archivados (`examenes.activo = false`) siguen referenciando el
--   grupo con `ON DELETE RESTRICT`: un grupo que se veía vacío no se podía
--   eliminar. Pasamos a borrado lógico, igual que `paquetes` (`0022`).
--
--   El nombre único pasa a valer solo entre grupos activos, para poder crear
--   de nuevo un grupo con el nombre de uno archivado.
-- =============================================================================

ALTER TABLE examenes_titulos
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

ALTER TABLE examenes_titulos
  DROP CONSTRAINT IF EXISTS examenes_titulos_nombre_unique;

CREATE UNIQUE INDEX IF NOT EXISTS examenes_titulos_nombre_unique
  ON examenes_titulos (nombre) WHERE activo;
