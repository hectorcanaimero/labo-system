-- =============================================================================
-- Migración 0003_paciente_sexo_not_null — sexo obligatorio en pacientes.
--
-- Completa filas legadas sin sexo antes de aplicar el constraint NOT NULL.
-- Aplicar forward-only vía InsForge CLI o `psql -f`.
-- =============================================================================

BEGIN;

UPDATE pacientes
SET sexo = 'M'
WHERE sexo IS NULL;

ALTER TABLE pacientes
  ALTER COLUMN sexo SET NOT NULL;

COMMIT;
