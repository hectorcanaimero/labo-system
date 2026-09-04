-- =============================================================================
-- 0014 — enlaces_resultado: acortador de links para compartir resultados
--
-- Contexto (GUR-18):
--   El operador envía los resultados al paciente por WhatsApp / email. El
--   mensaje lleva una URL pública `/r/{slug}` con la ficha web del resultado.
--   El slug es corto (10 chars base62 ≈ 59 bits) y aleatorio: la URL es la
--   credencial, así que NO debe ser adivinable ni derivable del UUID de la
--   orden.
--
--   `expira_en` acota la ventana de exposición de datos clínicos. El endpoint
--   público filtra por vencimiento; no hay borrado automático (un cron de
--   limpieza puede agregarse después si la tabla crece).
-- =============================================================================

CREATE TABLE IF NOT EXISTS enlaces_resultado (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL UNIQUE,
  orden_id   uuid        NOT NULL REFERENCES ordenes (id) ON DELETE CASCADE,
  expira_en  timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid        NOT NULL
);

-- Reutilizar el enlace vigente de una orden en vez de crear uno por envío.
CREATE INDEX IF NOT EXISTS enlaces_resultado_by_orden
  ON enlaces_resultado (orden_id, expira_en DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — espejo de 0009: anon denegado, lectura para usuarios activos.
-- La resolución pública del slug corre server-side con la API key admin
-- (bypass RLS), nunca con la anon key del browser.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE enlaces_resultado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enlaces_resultado_select ON enlaces_resultado;
CREATE POLICY enlaces_resultado_select ON enlaces_resultado
  FOR SELECT USING (public.is_authenticated());
