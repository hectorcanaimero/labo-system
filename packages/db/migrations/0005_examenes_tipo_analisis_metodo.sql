BEGIN;

ALTER TABLE examenes
  ADD COLUMN tipo_analisis text,
  ADD COLUMN metodo text;

ALTER TABLE resultados_examenes
  ADD COLUMN tipo_analisis_snap text,
  ADD COLUMN metodo_snap text;

COMMIT;
