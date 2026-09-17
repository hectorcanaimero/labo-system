-- =============================================================================
-- 0024 — ordenes.numero_correlativo: secuencia legible para el cliente
--
-- Contexto:
--   El UUID de una orden es ilegible para trato directo con el paciente. El
--   PDF de resultado hoy improvisa un "Nº" con `id.split("-")[0]`. Agregamos
--   `numero_correlativo` y lo exponemos como `RS-{año(created_at)}-{numero_padded_6}`
--   (formato lo aplica la UI en `packages/lib/numero-orden.ts`, la DB solo
--   guarda el int).
--
--   Ejemplo: `RS-2026-000127`.
--
--   A diferencia de 0013 (presupuestos), NO usamos `ADD COLUMN ... serial`
--   directo: ese enfoque numera las filas existentes en su orden FÍSICO
--   (ctid), que no necesariamente coincide con el orden cronológico de
--   creación (por ejemplo, tras un `VACUUM FULL` o una migración de datos).
--   Acá numeramos explícitamente por `created_at, id` para garantizar que la
--   orden más antigua sea la Nº 1, sin importar el orden físico de las filas.
-- =============================================================================

BEGIN;

ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS numero_correlativo integer;

UPDATE ordenes AS o
SET numero_correlativo = ranked.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM ordenes
) AS ranked
WHERE o.id = ranked.id
  AND o.numero_correlativo IS NULL;

CREATE SEQUENCE IF NOT EXISTS ordenes_numero_correlativo_seq
  OWNED BY ordenes.numero_correlativo;

SELECT setval(
  'ordenes_numero_correlativo_seq',
  COALESCE((SELECT MAX(numero_correlativo) FROM ordenes), 0)
);

ALTER TABLE ordenes
  ALTER COLUMN numero_correlativo SET DEFAULT nextval('ordenes_numero_correlativo_seq');

ALTER TABLE ordenes
  ALTER COLUMN numero_correlativo SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_numero_correlativo_unique
  ON ordenes (numero_correlativo);

COMMIT;
