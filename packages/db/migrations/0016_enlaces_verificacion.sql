-- =============================================================================
-- 0016 — enlaces_verificacion: slug permanente para el QR del informe
--
-- Contexto (F7.3.T2):
--   El PDF de resultados lleva un QR que abre `/v/{slug}`, una página que sirve
--   para confirmar que el informe es auténtico: laboratorio, fecha y hora,
--   cédula enmascarada y un botón de WhatsApp. Nunca muestra valores ni el
--   nombre completo del paciente.
--
--   Va en tabla propia y NO como un `tipo` dentro de `enlaces_resultado`
--   porque los dos enlaces tienen vigencias opuestas:
--     - el del paciente (`enlaces_resultado`) vence a los 30 días, que es lo
--       que acota la exposición de datos clínicos;
--     - el de verificación NO vence. El QR queda impreso en un papel que el
--       médico puede escanear meses después; si venciera, vería "enlace
--       vencido" sobre un informe legítimo y desconfiaría.
--   Meter los dos en la misma tabla obligaría a hacer `expira_en` nullable y a
--   que toda lectura se acuerde de filtrar por tipo. Separarlos deja cada
--   consulta sin condiciones que se puedan olvidar.
--
--   No hay UNIQUE sobre `orden_id`: el índice único parcial no aporta acá y el
--   repo reutiliza el enlace existente antes de insertar. Sí hay índice por
--   `orden_id` para esa búsqueda.
--
-- Sin BEGIN/COMMIT: el endpoint de migraciones de InsForge envuelve el SQL en
-- su propia transacción (docs/deploy/insforge-vps.md), igual que 0009-0015.
-- =============================================================================

CREATE TABLE IF NOT EXISTS enlaces_verificacion (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL UNIQUE,
  orden_id   uuid        NOT NULL REFERENCES ordenes (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Nullable a propósito: el enlace lo crea el sistema al entregar la orden o
  -- al emitir el PDF, y en la ruta pública no hay usuario en sesión.
  created_by uuid
);

CREATE INDEX IF NOT EXISTS enlaces_verificacion_by_orden
  ON enlaces_verificacion (orden_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — espejo de 0009 y 0014: anon denegado, lectura para usuarios activos.
-- La resolución pública del slug corre server-side con la API key admin
-- (bypass RLS), nunca con la anon key del browser.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE enlaces_verificacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enlaces_verificacion_select ON enlaces_verificacion;
CREATE POLICY enlaces_verificacion_select ON enlaces_verificacion
  FOR SELECT USING (public.is_authenticated());
