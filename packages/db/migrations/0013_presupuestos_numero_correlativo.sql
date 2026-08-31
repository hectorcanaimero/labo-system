-- =============================================================================
-- 0013 — presupuestos.numero_correlativo: secuencia legible para el cliente
--
-- Contexto:
--   El UUID de un presupuesto (`5ac6bea4-1068-...`) es ilegible para trato
--   directo con el paciente. Agregamos una columna `numero_correlativo` como
--   `serial` (secuencia global, no reset anual) y la exponemos en el PDF y en
--   listas como `PR-{año(created_at)}-{numero_padded_6}` (formato lo aplica
--   la UI, la DB solo guarda el int).
--
--   Ejemplo: `PR-2026-000127`.
--
--   Postgres populate automáticamente las filas existentes al agregar la
--   columna serial — se numeran en el orden de inserción (según nextval).
-- =============================================================================

ALTER TABLE presupuestos
  ADD COLUMN IF NOT EXISTS numero_correlativo serial NOT NULL;

-- Índice: buscar por número legible desde la UI (típico "consulto por PR-2026-000127").
CREATE UNIQUE INDEX IF NOT EXISTS presupuestos_numero_correlativo_unique
  ON presupuestos (numero_correlativo);
