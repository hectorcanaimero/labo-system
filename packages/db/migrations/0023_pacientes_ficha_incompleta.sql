-- =============================================================================
-- 0023 — pacientes: ficha incompleta (cédula/fecha de nacimiento/sexo opcionales)
--
-- Contexto (F8.2.T1):
--   Un presupuesto con "nombre libre" no genera un paciente real, así que no
--   puede enviarse (`api/presupuestos/[id]/enviar` devuelve
--   PACIENTE_LIBRE_REQUIERE_FICHA) ni aparece en Pacientes. La decisión es
--   crear, al vuelo, una ficha de paciente incompleta con los datos que sí
--   pide el formulario (nombre, apellido, teléfono y/o email) y dejar que
--   cédula, fecha de nacimiento y sexo se completen después desde la ficha.
--
--   No se agrega una columna "incompleta": una ficha es incompleta cuando le
--   falta cédula, fecha de nacimiento o sexo (`esFichaIncompleta` en
--   `packages/lib/schemas/paciente.ts`).
--
--   `pacientes_cedula_unique` se mantiene tal cual: Postgres no compara NULL
--   entre sí, así que varias fichas incompletas sin cédula conviven sin
--   chocar contra el UNIQUE.
--
--   Nuevo CHECK `pacientes_identificable`: toda ficha, completa o no, debe
--   tener al menos un dato para contactar o identificar al paciente (cédula,
--   teléfono o email) — nunca un registro totalmente anónimo.
--
-- Sin BEGIN/COMMIT explícito no hace falta acá porque son sentencias DDL
-- simples, pero se agrupan en una transacción para que, si el CHECK fallara
-- por datos legados sin ninguno de los tres campos, ninguna de las dos
-- ALTER quede aplicada a medias.
-- =============================================================================

BEGIN;

ALTER TABLE pacientes
  ALTER COLUMN cedula DROP NOT NULL,
  ALTER COLUMN fecha_nacimiento DROP NOT NULL,
  ALTER COLUMN sexo DROP NOT NULL;

ALTER TABLE pacientes
  ADD CONSTRAINT pacientes_identificable CHECK (
    cedula IS NOT NULL OR telefono IS NOT NULL OR email IS NOT NULL
  );

COMMIT;
