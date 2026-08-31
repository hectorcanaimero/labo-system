-- =============================================================================
-- 0009 — Row Level Security para acceso vía InsForge SDK (PostgREST)
--
-- Contexto (ADR-11 → migración SDK): el acceso a datos de dominio deja de ser
-- por postgres.js directo (superuser) y pasa por PostgREST con la anon key +
-- el JWT del usuario autenticado. Las tablas ya están expuestas por PostgREST,
-- así que SIN RLS la anon key pública lee/escribe TODO.
--
-- Modelo de acceso (espejo del requireRole server-side):
--   - anon (público):                      denegado en todas las tablas.
--   - usuario de dominio activo (operador): leer datos de negocio, CRUD
--     pacientes, crear presupuestos/resultados (vía RPC, no directo).
--   - admin:                                acceso completo (catálogo, config,
--     usuarios, tasa, audit, editar/borrar presupuestos y resultados).
--
-- Helpers SECURITY DEFINER: leen `usuarios` sin importar su RLS (evita
-- recursión). `search_path` fijado para evitar hijacking.
--
-- Nota: aplicar RLS no afecta a la conexión directa actual (superuser
-- `postgres` tiene BYPASSRLS) ni al admin MCP (owner). Es seguro aplicarla
-- antes de migrar los repos.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.role = 'admin' AND u.activo
  );
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.activo
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_authenticated() TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- pacientes — CRUD para cualquier usuario de dominio activo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pacientes_select ON pacientes;
CREATE POLICY pacientes_select ON pacientes FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS pacientes_insert ON pacientes;
CREATE POLICY pacientes_insert ON pacientes FOR INSERT WITH CHECK (public.is_authenticated());
DROP POLICY IF EXISTS pacientes_update ON pacientes;
CREATE POLICY pacientes_update ON pacientes FOR UPDATE USING (public.is_authenticated()) WITH CHECK (public.is_authenticated());
DROP POLICY IF EXISTS pacientes_delete ON pacientes;
CREATE POLICY pacientes_delete ON pacientes FOR DELETE USING (public.is_authenticated());

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo: examenes_titulos / examenes — SELECT autenticado, write admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE examenes_titulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS examenes_titulos_select ON examenes_titulos;
CREATE POLICY examenes_titulos_select ON examenes_titulos FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS examenes_titulos_write ON examenes_titulos;
CREATE POLICY examenes_titulos_write ON examenes_titulos FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE examenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS examenes_select ON examenes;
CREATE POLICY examenes_select ON examenes FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS examenes_write ON examenes;
CREATE POLICY examenes_write ON examenes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Paquetes — SELECT autenticado, write admin (creación compuesta vía RPC)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE paquetes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paquetes_select ON paquetes;
CREATE POLICY paquetes_select ON paquetes FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS paquetes_write ON paquetes;
CREATE POLICY paquetes_write ON paquetes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE paquetes_examenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paquetes_examenes_select ON paquetes_examenes;
CREATE POLICY paquetes_examenes_select ON paquetes_examenes FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS paquetes_examenes_write ON paquetes_examenes;
CREATE POLICY paquetes_examenes_write ON paquetes_examenes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Presupuestos — SELECT autenticado; INSERT vía RPC; UPDATE/DELETE admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS presupuestos_select ON presupuestos;
CREATE POLICY presupuestos_select ON presupuestos FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS presupuestos_update ON presupuestos;
CREATE POLICY presupuestos_update ON presupuestos FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS presupuestos_delete ON presupuestos;
CREATE POLICY presupuestos_delete ON presupuestos FOR DELETE USING (public.is_admin());

ALTER TABLE presupuestos_examenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS presupuestos_examenes_select ON presupuestos_examenes;
CREATE POLICY presupuestos_examenes_select ON presupuestos_examenes FOR SELECT USING (public.is_authenticated());
-- Sin policies de escritura: las líneas se escriben dentro del RPC de creación.

-- ─────────────────────────────────────────────────────────────────────────────
-- Resultados — SELECT autenticado; INSERT vía RPC; UPDATE/DELETE admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resultados_select ON resultados;
CREATE POLICY resultados_select ON resultados FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS resultados_update ON resultados;
CREATE POLICY resultados_update ON resultados FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS resultados_delete ON resultados;
CREATE POLICY resultados_delete ON resultados FOR DELETE USING (public.is_admin());

ALTER TABLE resultados_examenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resultados_examenes_select ON resultados_examenes;
CREATE POLICY resultados_examenes_select ON resultados_examenes FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS resultados_examenes_update ON resultados_examenes;
CREATE POLICY resultados_examenes_update ON resultados_examenes FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Config — SELECT autenticado (branding PDF/header), write admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE laboratorio_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS laboratorio_config_select ON laboratorio_config;
CREATE POLICY laboratorio_config_select ON laboratorio_config FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS laboratorio_config_write ON laboratorio_config;
CREATE POLICY laboratorio_config_write ON laboratorio_config FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- usuarios — SELECT (admin u fila propia), INSERT propia (syncFromAuth),
-- UPDATE (admin u propia), DELETE admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usuarios_select ON usuarios;
CREATE POLICY usuarios_select ON usuarios FOR SELECT
  USING (public.is_admin() OR auth_user_id = auth.uid());
DROP POLICY IF EXISTS usuarios_insert ON usuarios;
CREATE POLICY usuarios_insert ON usuarios FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());
DROP POLICY IF EXISTS usuarios_update ON usuarios;
CREATE POLICY usuarios_update ON usuarios FOR UPDATE
  USING (public.is_admin() OR auth_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR auth_user_id = auth.uid());
DROP POLICY IF EXISTS usuarios_delete ON usuarios;
CREATE POLICY usuarios_delete ON usuarios FOR DELETE USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- tasa_cambio_bcv — SELECT autenticado, write admin (cron usa admin client)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tasa_cambio_bcv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasa_cambio_bcv_select ON tasa_cambio_bcv;
CREATE POLICY tasa_cambio_bcv_select ON tasa_cambio_bcv FOR SELECT USING (public.is_authenticated());
DROP POLICY IF EXISTS tasa_cambio_bcv_write ON tasa_cambio_bcv;
CREATE POLICY tasa_cambio_bcv_write ON tasa_cambio_bcv FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_log — SELECT admin, INSERT autenticado (eventos de auth), sin update/delete
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (public.is_authenticated());

-- ─────────────────────────────────────────────────────────────────────────────
-- migration_map — admin only (lo usa el script de migración WP)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE migration_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS migration_map_all ON migration_map;
CREATE POLICY migration_map_all ON migration_map FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
