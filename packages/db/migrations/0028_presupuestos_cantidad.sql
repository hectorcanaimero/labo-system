-- =============================================================================
-- 0028 — cantidad por línea de presupuesto
--
-- Contexto:
--   Presupuestos para empresas (pre empleo, vacacionales): el mismo examen se
--   cotiza N veces en un solo presupuesto en vez de uno por empleado.
--   `precio_final_snap` pasa a ser el total de la línea (unitario × cantidad),
--   así todo lo que ya suma precios finales sigue cuadrando sin cambios.
--
--   La orden que sale de un presupuesto copia cada examen una sola vez: cada
--   empleado se registra después con su propia orden.
--
-- Sin BEGIN/COMMIT: el endpoint de migraciones de InsForge envuelve el SQL en
-- su propia transacción (docs/deploy/insforge-vps.md).
-- =============================================================================

ALTER TABLE presupuestos_examenes
  ADD COLUMN IF NOT EXISTS cantidad integer NOT NULL DEFAULT 1
  CHECK (cantidad BETWEEN 1 AND 10000);
