BEGIN;

ALTER TABLE paquetes
  ADD COLUMN precio_base numeric(12,2) NOT NULL DEFAULT 0;

COMMIT;
