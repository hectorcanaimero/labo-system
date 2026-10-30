-- =============================================================================
-- 0026 — orden de los exámenes dentro de su grupo y grupos en el presupuesto
--
-- Contexto:
--   Los grupos (`examenes_titulos`) se incluyen completos en un paquete por
--   referencia (`paquetes_titulos`), pero presupuesto y resultados no los
--   veían, y sus exámenes no tenían orden propio (salían por nombre). La
--   hematología tiene que salir en orden clínico.
--
--   - `examenes.orden`: posición del examen dentro de su grupo, editable
--     arrastrando en Exámenes. Arranca por fecha de creación, que es más
--     cercana al orden clínico que el alfabético.
--   - `presupuestos_examenes.grupo_snap`: en el presupuesto un grupo se ve
--     como una sola línea con un precio (la suma de sus exámenes, editable).
--     Las líneas siguen siendo por examen, para que la orden y los
--     resultados reciban la lista; esto guarda el nombre del grupo.
--
-- Sin BEGIN/COMMIT: el endpoint de migraciones de InsForge envuelve el SQL en
-- su propia transacción (docs/deploy/insforge-vps.md).
-- =============================================================================

ALTER TABLE examenes
  ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0;

UPDATE examenes e
SET orden = o.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY titulo_id ORDER BY created_at, id) AS rn
  FROM examenes
) o
WHERE o.id = e.id AND e.orden = 0;

ALTER TABLE presupuestos_examenes
  ADD COLUMN IF NOT EXISTS grupo_snap text;
