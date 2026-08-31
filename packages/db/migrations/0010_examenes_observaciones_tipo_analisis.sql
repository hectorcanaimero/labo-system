-- =============================================================================
-- 0010 — examenes: agregar observaciones + hacer tipo_analisis obligatorio
--
-- Contexto:
--   - `observaciones text`: nueva columna opcional para notas del examen
--     (ej. "requiere ayuno de 8 horas", "muestra en tubo con EDTA", etc).
--   - `tipo_analisis`: hasta ahora era `text NULL`. Pasa a NOT NULL — cada
--     examen debe tener una etiqueta de tipo ("Análisis Químico", "Análisis
--     Hematológico", "Análisis Inmunológico", etc). El enum lo enforcea el
--     schema Zod client-side; en DB lo dejamos text libre para permitir
--     ajustes de vocabulario sin migración nueva.
--
-- Backfill: filas existentes con `tipo_analisis IS NULL` se rellenan con
--   'Otro' (bucket de fallback) antes del SET NOT NULL.
-- =============================================================================

ALTER TABLE examenes
  ADD COLUMN IF NOT EXISTS observaciones text;

UPDATE examenes
SET tipo_analisis = 'Otro'
WHERE tipo_analisis IS NULL OR btrim(tipo_analisis) = '';

ALTER TABLE examenes
  ALTER COLUMN tipo_analisis SET NOT NULL;
