BEGIN;

ALTER TABLE presupuestos
  DROP CONSTRAINT IF EXISTS presupuestos_estado_check;

ALTER TABLE presupuestos
  ADD COLUMN motivo_rechazo text,
  ADD COLUMN fecha_estado timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT presupuestos_estado_check CHECK (
    estado IN (
      'Borrador',
      'Enviado',
      'Aprobado',
      'Rechazado',
      'Cancelado',
      'Convertido'
    )
  ),
  ADD CONSTRAINT presupuestos_motivo_rechazo_check CHECK (
    estado <> 'Rechazado'
    OR (
      motivo_rechazo IS NOT NULL
      AND char_length(btrim(motivo_rechazo)) >= 3
    )
  );

COMMIT;
