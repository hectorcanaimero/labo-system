-- =============================================================================
-- 0018 — pacientes: enlace de ubicación
--
-- Contexto (F7.4.T2):
--   El laboratorio toma muestras a domicilio y pide la ubicación del paciente
--   por WhatsApp (un pin de Maps o un par de coordenadas pegado a mano). No
--   había dónde guardarlo.
--
--   Columna nueva, nullable: la dirección en texto libre (`direccion`, ya
--   existente) pasa a requerida a nivel de aplicación (Zod), no de esquema —
--   los pacientes ya cargados sin dirección no deben quedar inválidos en la
--   base. `ubicacion_url` es siempre opcional: guarda el enlace de Maps o el
--   "lat,long" tal como lo pega el operador; la resolución a un enlace
--   abrible vive en `packages/lib/ubicacion.ts`.
--
-- Sin BEGIN/COMMIT a propósito: el endpoint de migraciones de InsForge corre
-- el SQL en su propia transacción (docs/deploy/insforge-vps.md), igual que
-- 0009-0015.
-- =============================================================================

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS ubicacion_url text;
