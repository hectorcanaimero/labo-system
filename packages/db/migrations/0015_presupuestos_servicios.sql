-- =============================================================================
-- 0015 — presupuestos: toma de muestra y servicio a domicilio
--
-- Contexto (F7.2.T2):
--   El laboratorio cobra dos cargos que no son exámenes: la toma de muestra y,
--   cuando va a la casa del paciente, el servicio a domicilio. Hasta ahora no
--   había dónde ponerlos: `presupuestos_examenes.examen_id` es NOT NULL con FK
--   a `examenes` (0001), así que un cargo sin examen no entra como línea.
--
--   Van como dos columnas planas del encabezado, no como líneas:
--     - son siempre a lo sumo uno por presupuesto,
--     - no tocan la FK ni el schema de líneas,
--     - la conversión a orden, que copia todas las líneas, los ignora sola.
--
--   Se suman al total DESPUÉS del descuento y la ganancia: son costos de
--   servicio, no mercadería sobre la que el laboratorio marque margen.
--
--   `laboratorio_config.toma_muestra_default_usd` es el valor con el que el
--   formulario precarga el campo. Queda en 0 y lo fija el cliente desde Config
--   (en la demo hablaron de 4 USD, pero sin confirmar).
--
-- Sin BEGIN/COMMIT a propósito: el endpoint de migraciones de InsForge corre
-- el SQL en su propia transacción (docs/deploy/insforge-vps.md), igual que
-- 0009-0014.
-- =============================================================================

ALTER TABLE presupuestos
  ADD COLUMN IF NOT EXISTS toma_muestra_usd numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS domicilio_usd    numeric(12, 2) NOT NULL DEFAULT 0;

-- Los CHECK van aparte de ADD COLUMN: `ADD CONSTRAINT IF NOT EXISTS` no existe
-- en Postgres, así que se dropea primero para que la migración sea reejecutable.
ALTER TABLE presupuestos
  DROP CONSTRAINT IF EXISTS presupuestos_toma_muestra_usd_check,
  DROP CONSTRAINT IF EXISTS presupuestos_domicilio_usd_check;

ALTER TABLE presupuestos
  ADD CONSTRAINT presupuestos_toma_muestra_usd_check CHECK (toma_muestra_usd >= 0),
  ADD CONSTRAINT presupuestos_domicilio_usd_check    CHECK (domicilio_usd >= 0);

ALTER TABLE laboratorio_config
  ADD COLUMN IF NOT EXISTS toma_muestra_default_usd numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE laboratorio_config
  DROP CONSTRAINT IF EXISTS laboratorio_config_toma_muestra_default_usd_check;

ALTER TABLE laboratorio_config
  ADD CONSTRAINT laboratorio_config_toma_muestra_default_usd_check
    CHECK (toma_muestra_default_usd >= 0);
