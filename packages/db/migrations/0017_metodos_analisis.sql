-- =============================================================================
-- 0017 — metodos_analisis: catálogo administrable de métodos
--
-- Contexto (F7.4.T1):
--   `examenes.metodo` es texto libre con un datalist de seis valores fijos en
--   el formulario, así que cada quien escribe el mismo método distinto
--   ("ELISA", "Elisa", "E.L.I.S.A.") y no hay forma de corregirlo en masa. En
--   la reunión se acordó que el admin administre la lista.
--
--   `examenes.metodo` SIGUE siendo texto y se guarda el nombre elegido: esta
--   tabla es la fuente del selector, no una FK. Eso deja intacto el snapshot
--   `ordenes_examenes.metodo_snap` (0005), que tiene que conservar el método
--   tal como estaba el día de la orden aunque después se renombre o se
--   desactive.
--
--   `activo` desactiva sin borrar: un método que ya no se usa desaparece del
--   selector pero se sigue viendo en los exámenes que lo tenían.
--
-- Sin BEGIN/COMMIT: el endpoint de migraciones de InsForge envuelve el SQL en
-- su propia transacción (docs/deploy/insforge-vps.md), igual que 0009-0016.
-- =============================================================================

CREATE TABLE IF NOT EXISTS metodos_analisis (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text        NOT NULL,
  activo     boolean     NOT NULL DEFAULT true,
  orden      integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metodos_analisis_nombre_unique UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS metodos_analisis_by_orden
  ON metodos_analisis (activo, orden, nombre);

-- Poblar con los métodos que ya se escribieron a mano, sin duplicar los que
-- difieran sólo en espacios. `ON CONFLICT DO NOTHING` la hace reejecutable.
INSERT INTO metodos_analisis (nombre, orden)
SELECT nombre, (row_number() OVER (ORDER BY nombre))::int
FROM (
  SELECT DISTINCT trim(metodo) AS nombre
  FROM examenes
  WHERE metodo IS NOT NULL AND trim(metodo) <> ''
) AS distintos
ON CONFLICT ON CONSTRAINT metodos_analisis_nombre_unique DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — espejo de 0009: anon denegado, lectura para usuarios activos. La
-- escritura va server-side con la API key admin, que hace bypass de RLS.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE metodos_analisis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metodos_analisis_select ON metodos_analisis;
CREATE POLICY metodos_analisis_select ON metodos_analisis
  FOR SELECT USING (public.is_authenticated());
