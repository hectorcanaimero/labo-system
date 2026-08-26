BEGIN;

ALTER TABLE laboratorio_config
  ADD COLUMN IF NOT EXISTS colegio_bioanalistas text,
  ADD COLUMN IF NOT EXISTS mpps text;

-- Seed idempotente de la identidad institucional de RV Laboratorio.
INSERT INTO laboratorio_config (
  singleton, nombre, direccion, telefono, email, rif,
  colegio_bioanalistas, mpps, updated_by
)
VALUES (
  true,
  'RV Laboratorio',
  'El Guamo, Puerto Ordaz, Edo. Bolívar',
  '0424-9646265',
  'rvlaboratoriopzo@gmail.com',
  'V-15542126-2',
  'N° 713',
  '10738',
  gen_random_uuid()
)
ON CONFLICT (singleton) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  direccion = EXCLUDED.direccion,
  telefono = EXCLUDED.telefono,
  email = EXCLUDED.email,
  rif = EXCLUDED.rif,
  colegio_bioanalistas = EXCLUDED.colegio_bioanalistas,
  mpps = EXCLUDED.mpps,
  updated_at = now();

COMMIT;
