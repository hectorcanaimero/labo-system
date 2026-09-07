-- =============================================================================
-- 0019 — tipos_analisis: catálogo administrable de tipos de análisis
--
-- Contexto (F7.4.T3):
--   El tipo de análisis salía de un enum fijo en
--   `packages/lib/schemas/examen.ts` (`TIPO_ANALISIS_VALUES`): ampliar el
--   vocabulario obligaba a tocar código y desplegar. Pasa a ser una tabla que
--   el admin mantiene, igual que `metodos_analisis` (0017).
--
--   `examenes.tipo_analisis` SIGUE siendo texto y guarda el nombre elegido:
--   esta tabla es la fuente del selector, no una FK. Eso deja intacto el
--   snapshot `ordenes_examenes.tipo_analisis_snap`, que tiene que conservar el
--   tipo tal como estaba el día de la orden aunque después se renombre o se
--   desactive.
--
--   El seed son los ocho valores del enum, en su orden original, más cualquier
--   valor distinto que ya exista en `examenes.tipo_analisis` (por ejemplo los
--   que entraron por importación, que nunca se validaron contra el enum).
--
-- Sin BEGIN/COMMIT: el endpoint de migraciones de InsForge envuelve el SQL en
-- su propia transacción (docs/deploy/insforge-vps.md), igual que 0009-0018.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tipos_analisis (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text        NOT NULL,
  activo     boolean     NOT NULL DEFAULT true,
  orden      integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipos_analisis_nombre_unique UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS tipos_analisis_by_orden
  ON tipos_analisis (activo, orden, nombre);

-- Los ocho del enum, en el orden en que estaban declarados.
INSERT INTO tipos_analisis (nombre, orden)
VALUES
  ('Análisis Químico',         1),
  ('Análisis Hematológico',    2),
  ('Análisis Microbiológico',  3),
  ('Análisis Inmunológico',    4),
  ('Análisis Hormonal',        5),
  ('Análisis Físico-químico',  6),
  ('Análisis Molecular',       7),
  ('Otro',                     8)
ON CONFLICT ON CONSTRAINT tipos_analisis_nombre_unique DO NOTHING;

-- Y lo que ya exista en los exámenes y no esté en el enum, detrás de los ocho.
-- `trim` + `DISTINCT` evita duplicar por espacios; nulos y vacíos quedan fuera.
INSERT INTO tipos_analisis (nombre, orden)
SELECT
  d.nombre,
  (8 + row_number() OVER (ORDER BY d.nombre))::int
FROM (
  SELECT DISTINCT trim(tipo_analisis) AS nombre
  FROM examenes
  WHERE tipo_analisis IS NOT NULL AND trim(tipo_analisis) <> ''
) AS d
WHERE NOT EXISTS (SELECT 1 FROM tipos_analisis t WHERE t.nombre = d.nombre)
ON CONFLICT ON CONSTRAINT tipos_analisis_nombre_unique DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — espejo de 0009 y 0017: anon denegado, lectura para usuarios activos.
-- La escritura va server-side con la API key admin, que hace bypass de RLS.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tipos_analisis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tipos_analisis_select ON tipos_analisis;
CREATE POLICY tipos_analisis_select ON tipos_analisis
  FOR SELECT USING (public.is_authenticated());
