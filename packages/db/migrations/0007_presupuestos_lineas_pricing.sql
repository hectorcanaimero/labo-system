-- =============================================================================
-- Migración 0007_presupuestos_lineas_pricing — pricing por línea.
--
-- Los valores se copian desde precio_snap para que las líneas existentes sigan
-- siendo válidas y, a partir de esta migración, conserven el precio base y el
-- precio final que se mostraron al usuario.
-- =============================================================================

BEGIN;

ALTER TABLE presupuestos_examenes
  ADD COLUMN paquete_id uuid REFERENCES paquetes (id) ON DELETE RESTRICT,
  ADD COLUMN precio_base_snap numeric(12, 2),
  ADD COLUMN ganancia_pct numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN precio_final_snap numeric(12, 2);

UPDATE presupuestos_examenes
SET precio_base_snap = precio_snap,
    precio_final_snap = precio_snap
WHERE precio_base_snap IS NULL
   OR precio_final_snap IS NULL;

ALTER TABLE presupuestos_examenes
  ALTER COLUMN precio_base_snap SET NOT NULL,
  ALTER COLUMN precio_final_snap SET NOT NULL,
  ADD CONSTRAINT presupuestos_examenes_precio_base_snap_check
    CHECK (precio_base_snap >= 0),
  ADD CONSTRAINT presupuestos_examenes_ganancia_pct_check
    CHECK (ganancia_pct >= 0),
  ADD CONSTRAINT presupuestos_examenes_precio_final_snap_check
    CHECK (precio_final_snap >= 0);

COMMIT;
