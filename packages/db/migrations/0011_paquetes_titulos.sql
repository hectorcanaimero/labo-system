-- =============================================================================
-- 0011 — paquetes_titulos: grupos completos incluidos en un paquete
--
-- Contexto:
--   Un paquete hoy contiene exámenes individuales (paquetes_examenes). Ahora
--   también puede incluir GRUPOS enteros (títulos de examenes_titulos) por
--   REFERENCIA DINÁMICA: si se agrega un examen nuevo al grupo, todos los
--   paquetes que lo referencian lo incluyen automáticamente al expandirse en
--   presupuestos.
--
--   PK compuesta (paquete_id, titulo_id): un mismo grupo no se puede agregar
--   dos veces al mismo paquete.
--
--   FKs:
--     - paquete_id → paquetes.id  ON DELETE CASCADE (borrar el paquete limpia
--       sus vínculos).
--     - titulo_id  → examenes_titulos.id  ON DELETE RESTRICT (no dejar borrar
--       un grupo que está en uso en algún paquete).
-- =============================================================================

CREATE TABLE IF NOT EXISTS paquetes_titulos (
  paquete_id uuid    NOT NULL REFERENCES paquetes           (id) ON DELETE CASCADE,
  titulo_id  uuid    NOT NULL REFERENCES examenes_titulos   (id) ON DELETE RESTRICT,
  orden      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (paquete_id, titulo_id)
);

CREATE INDEX IF NOT EXISTS paquetes_titulos_by_paquete
  ON paquetes_titulos (paquete_id, orden);
