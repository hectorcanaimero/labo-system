-- =============================================================================
-- 0020 — ganancia por defecto (Config) y flag de paquete cerrado (F7.2.T6)
--
-- Contexto:
--   El usuario definió el modelo de ganancia del presupuesto: en modo abierto
--   (sueltos o paquete desglosado) cada línea arranca con un valor por
--   defecto que se fija una sola vez en Configuración, no hardcodeado ni
--   copiado de la ganancia global (que en modo abierto ni se muestra).
--
--   `laboratorio_config.ganancia_default_pct` es ese valor. Mismo patrón que
--   `toma_muestra_default_usd` (0015): columna con DEFAULT 0, CHECK aparte
--   porque `ADD CONSTRAINT IF NOT EXISTS` no existe en Postgres.
--
--   `presupuestos_examenes.cerrado` reemplaza la inferencia por
--   `ganancia_pct = 0` que traía F7.2.T5 (`esPaqueteCerrado` en
--   packages/lib/presupuesto-lineas.ts). Esa inferencia dejó de servir: ahora
--   una línea de paquete cerrado guarda la ganancia global REALMENTE
--   aplicada (para que el total footer y el PDF cuadren si se recalculan),
--   no un 0 explícito — así que 0 ya no distingue "cerrado" de "abierto con
--   ganancia 0". El flag es explícito y no depende de ningún valor numérico.
--
-- Sin BEGIN/COMMIT a propósito: el endpoint de migraciones de InsForge corre
-- el SQL en su propia transacción (docs/deploy/insforge-vps.md), igual que
-- 0009-0019. NO aplicar en hosted todavía — lo hace el usuario/planner.
-- =============================================================================

ALTER TABLE laboratorio_config
  ADD COLUMN IF NOT EXISTS ganancia_default_pct numeric(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE laboratorio_config
  DROP CONSTRAINT IF EXISTS laboratorio_config_ganancia_default_pct_check;

ALTER TABLE laboratorio_config
  ADD CONSTRAINT laboratorio_config_ganancia_default_pct_check
    CHECK (ganancia_default_pct >= 0);

ALTER TABLE presupuestos_examenes
  ADD COLUMN IF NOT EXISTS cerrado boolean NOT NULL DEFAULT false;
