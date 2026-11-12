-- =============================================================================
-- 0027 — observaciones por grupo en la orden
--
-- Contexto:
--   El informe de resultados sale con una hoja por grupo (Hematología, Orina,
--   Química…) y cada grupo puede leerlo un médico distinto, así que la
--   licenciada necesita comentar cada uno por separado. `ordenes.observaciones`
--   sigue siendo la observación general; esta tabla guarda una por grupo.
--
--   Se llavea por `titulo_id` (no por nombre) para que renombrar un grupo en el
--   catálogo no deje la observación huérfana. Los grupos se archivan, no se
--   borran, así que el CASCADE sólo cubre un borrado manual.
--
-- Sin BEGIN/COMMIT: el endpoint de migraciones de InsForge envuelve el SQL en
-- su propia transacción (docs/deploy/insforge-vps.md).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ordenes_grupos_observaciones (
  orden_id    uuid NOT NULL REFERENCES ordenes (id) ON DELETE CASCADE,
  titulo_id   uuid NOT NULL REFERENCES examenes_titulos (id) ON DELETE CASCADE,
  observacion text NOT NULL CHECK (length(btrim(observacion)) > 0),
  PRIMARY KEY (orden_id, titulo_id)
);
