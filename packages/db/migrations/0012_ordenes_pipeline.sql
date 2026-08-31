-- =============================================================================
-- 0012 — Pipeline de laboratorio: rename resultados → ordenes + ampliar estados
--        Presupuestos: reemplazar 'Convertido' por 'Cerrado'
--
-- Contexto:
--   El modelo "resultado" con solo Pendiente/Completado no refleja el flujo
--   real de un laboratorio. Se renombra a "orden" (orden de servicio) y se
--   amplía a un pipeline de 6 estados: Registrada, Muestra tomada, En proceso,
--   Validando, Entregada, Anulada.
--
--   En presupuestos, 'Convertido' pasa a 'Cerrado' — semánticamente más claro
--   ("el presupuesto cerró la operación comercial y generó una orden").
--
-- Cambios:
--   1. Backfill de datos existentes.
--   2. Drop CHECKs viejos.
--   3. Rename tablas / columnas / constraints / índices.
--   4. Add CHECKs nuevos con el vocabulario ampliado.
--   5. Update de default de ordenes.estado.
--
-- ATENCIÓN — este es un rename estructural. Todos los repos y endpoints que
-- referencien `resultados` / `resultados_examenes` / `resultado_id` deben
-- actualizarse en la misma tanda.
-- =============================================================================

-- 1) Drop CHECKs viejos ANTES del backfill (los nuevos valores violan el
--    CHECK actual, así que hay que sacarlo primero).
ALTER TABLE resultados   DROP CONSTRAINT IF EXISTS resultados_estado_check;
ALTER TABLE presupuestos DROP CONSTRAINT IF EXISTS presupuestos_estado_check;

-- 2) Backfill: convertir los valores existentes al nuevo vocabulario.
UPDATE resultados
SET estado = CASE estado
  WHEN 'Pendiente'  THEN 'Registrada'
  WHEN 'Completado' THEN 'Entregada'
  ELSE estado
END
WHERE estado IN ('Pendiente', 'Completado');

UPDATE presupuestos
SET estado = 'Cerrado'
WHERE estado = 'Convertido';

-- 3) Renames — tablas, columnas, constraints, índices.

--   3a) Tablas
ALTER TABLE resultados          RENAME TO ordenes;
ALTER TABLE resultados_examenes RENAME TO ordenes_examenes;

--   3b) Columnas
ALTER TABLE presupuestos      RENAME COLUMN resultado_id TO orden_id;
ALTER TABLE ordenes_examenes  RENAME COLUMN resultado_id TO orden_id;

--   3c) Constraints (nombres autogenerados con "resultados" en el medio)
ALTER TABLE ordenes RENAME CONSTRAINT resultados_pkey
                                 TO ordenes_pkey;
ALTER TABLE ordenes RENAME CONSTRAINT resultados_paciente_id_fkey
                                 TO ordenes_paciente_id_fkey;
ALTER TABLE ordenes RENAME CONSTRAINT resultados_origen_presupuesto_id_fkey
                                 TO ordenes_origen_presupuesto_id_fkey;

ALTER TABLE ordenes_examenes RENAME CONSTRAINT resultados_examenes_pkey
                                          TO ordenes_examenes_pkey;
ALTER TABLE ordenes_examenes RENAME CONSTRAINT resultados_examenes_examen_id_fkey
                                          TO ordenes_examenes_examen_id_fkey;
ALTER TABLE ordenes_examenes RENAME CONSTRAINT resultados_examenes_resultado_id_fkey
                                          TO ordenes_examenes_orden_id_fkey;
ALTER TABLE ordenes_examenes RENAME CONSTRAINT resultados_examenes_precio_snap_check
                                          TO ordenes_examenes_precio_snap_check;

ALTER TABLE presupuestos RENAME CONSTRAINT presupuestos_resultado_fk
                                      TO presupuestos_orden_fk;

--   3d) Índices
ALTER INDEX resultados_by_paciente             RENAME TO ordenes_by_paciente;
ALTER INDEX resultados_by_fecha                RENAME TO ordenes_by_fecha;
ALTER INDEX resultados_by_estado               RENAME TO ordenes_by_estado;
ALTER INDEX resultados_examenes_by_resultado   RENAME TO ordenes_examenes_by_orden;

-- 4) Defaults + CHECKs nuevos.
ALTER TABLE ordenes
  ALTER COLUMN estado SET DEFAULT 'Registrada';

ALTER TABLE ordenes
  ADD CONSTRAINT ordenes_estado_check CHECK (estado IN (
    'Registrada',
    'Muestra tomada',
    'En proceso',
    'Validando',
    'Entregada',
    'Anulada'
  ));

ALTER TABLE presupuestos
  ADD CONSTRAINT presupuestos_estado_check CHECK (estado IN (
    'Borrador',
    'Enviado',
    'Aprobado',
    'Rechazado',
    'Cancelado',
    'Cerrado'
  ));
