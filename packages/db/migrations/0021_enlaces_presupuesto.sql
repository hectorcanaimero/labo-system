-- =============================================================================
-- 0021 — enlaces_presupuesto: acortador de links para compartir presupuestos
--
-- Contexto (F7.2.T7):
--   Espejo de `enlaces_resultado` (0014, GUR-18) para presupuestos: el
--   operador manda el presupuesto por WhatsApp / email con una URL pública
--   `/p/{slug}`. Mismo slug corto y aleatorio (la URL es la credencial),
--   mismo `expira_en` acotando la exposición.
--
--   Vigencia 7 días, más larga que la de resultados (30 días por defecto en
--   código, ver `DIAS_VIGENCIA_DEFAULT`): un presupuesto vale 24 h como
--   cotización, pero el enlace se puede releer una semana sin que el
--   paciente tenga que pedirlo de nuevo. La vigencia se fija en
--   `packages/db/repos/enlaces.ts` (parámetro `diasVigencia`), no acá.
-- =============================================================================

CREATE TABLE IF NOT EXISTS enlaces_presupuesto (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text        NOT NULL UNIQUE,
  presupuesto_id uuid        NOT NULL REFERENCES presupuestos (id) ON DELETE CASCADE,
  expira_en      timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid        NOT NULL
);

-- Reutilizar el enlace vigente de un presupuesto en vez de crear uno por envío.
CREATE INDEX IF NOT EXISTS enlaces_presupuesto_by_presupuesto
  ON enlaces_presupuesto (presupuesto_id, expira_en DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — espejo de enlaces_resultado (0014): anon denegado, lectura para
-- usuarios activos. La resolución pública del slug corre server-side con la
-- API key admin (bypass RLS), nunca con la anon key del browser.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE enlaces_presupuesto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enlaces_presupuesto_select ON enlaces_presupuesto;
CREATE POLICY enlaces_presupuesto_select ON enlaces_presupuesto
  FOR SELECT USING (public.is_authenticated());
