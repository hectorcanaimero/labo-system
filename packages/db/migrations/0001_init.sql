-- =============================================================================
-- Migración 0001_init — Esquema inicial LabSystem sobre InsForge/Postgres.
--
-- Aplicación: forward-only, timestamped, vía InsForge CLI (o `psql -f`).
-- Fuente de verdad canónica: packages/db/schema.sql (mantenerlas alineadas).
-- Refs: ADR-04, ADR-05, ADR-06, ADR-11.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- laboratorio_config (singleton)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE laboratorio_config (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton       boolean     NOT NULL DEFAULT true UNIQUE CHECK (singleton = true),
  nombre          text        NOT NULL,
  direccion       text        NOT NULL,
  telefono        text,
  email           text,
  rif             text,
  logo_object_key       text,
  firma_object_key      text,
  sello_object_key      text,
  pdf_pie_pagina  text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid        NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- pacientes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pacientes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            text        NOT NULL,
  apellido          text        NOT NULL,
  cedula            text        NOT NULL,
  fecha_nacimiento  timestamptz NOT NULL,
  sexo              text        CHECK (sexo IN ('M', 'F', 'O')),
  telefono          text,
  email             text,
  direccion         text,
  activo            boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pacientes_cedula_unique UNIQUE (cedula)
);

CREATE INDEX pacientes_by_cedula        ON pacientes (cedula);
CREATE INDEX pacientes_by_search_nombre ON pacientes (nombre, apellido);
CREATE INDEX pacientes_by_created       ON pacientes (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo: examenes_titulos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE examenes_titulos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text        NOT NULL,
  orden       integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT examenes_titulos_nombre_unique UNIQUE (nombre)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo: examenes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE examenes (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id           uuid           NOT NULL REFERENCES examenes_titulos (id) ON DELETE RESTRICT,
  nombre              text           NOT NULL,
  precio_usd          numeric(12, 2) NOT NULL CHECK (precio_usd >= 0),
  unidad              text,
  valores_referencia  text,
  activo              boolean        NOT NULL DEFAULT true,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT examenes_titulo_nombre_unique UNIQUE (titulo_id, nombre)
);

CREATE INDEX examenes_by_titulo        ON examenes (titulo_id, nombre);
CREATE INDEX examenes_by_nombre_search ON examenes (nombre);

-- ─────────────────────────────────────────────────────────────────────────────
-- Paquetes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE paquetes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text        NOT NULL,
  descripcion text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paquetes_nombre_unique UNIQUE (nombre)
);

CREATE TABLE paquetes_examenes (
  paquete_id uuid    NOT NULL REFERENCES paquetes (id) ON DELETE CASCADE,
  examen_id  uuid    NOT NULL REFERENCES examenes (id) ON DELETE RESTRICT,
  orden      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (paquete_id, examen_id)
);

CREATE INDEX paquetes_examenes_by_paquete ON paquetes_examenes (paquete_id, orden);

-- ─────────────────────────────────────────────────────────────────────────────
-- Presupuestos (ADR-05: XOR paciente_id / paciente_nombre_libre)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE presupuestos (
  id                     uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id            uuid           REFERENCES pacientes (id) ON DELETE RESTRICT,
  paciente_nombre_libre  text,
  descuento_pct          numeric(5, 2)  NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
  ganancia_pct           numeric(5, 2)  NOT NULL DEFAULT 0 CHECK (ganancia_pct >= 0),
  tasa_bs                numeric(14, 4) NOT NULL CHECK (tasa_bs > 0),
  total_usd              numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
  total_bs               numeric(16, 2) NOT NULL DEFAULT 0 CHECK (total_bs >= 0),
  estado                 text           NOT NULL DEFAULT 'Borrador'
                                        CHECK (estado IN ('Borrador', 'Aprobado', 'Convertido')),
  resultado_id           uuid,
  created_at             timestamptz    NOT NULL DEFAULT now(),
  created_by             uuid           NOT NULL,
  CONSTRAINT presupuestos_paciente_xor CHECK (
    (paciente_id IS NULL) <> (paciente_nombre_libre IS NULL)
  )
);

CREATE INDEX presupuestos_by_paciente ON presupuestos (paciente_id, created_at DESC);
CREATE INDEX presupuestos_by_estado   ON presupuestos (estado, created_at DESC);
CREATE INDEX presupuestos_by_fecha    ON presupuestos (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Resultados
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE resultados (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id           uuid        NOT NULL REFERENCES pacientes (id) ON DELETE RESTRICT,
  fecha_muestra         timestamptz NOT NULL,
  fecha_resultado       timestamptz,
  medico_solicitante    text,
  estado                text        NOT NULL DEFAULT 'Pendiente'
                                    CHECK (estado IN ('Pendiente', 'Completado')),
  observaciones         text,
  origen_presupuesto_id uuid        REFERENCES presupuestos (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        NOT NULL
);

CREATE INDEX resultados_by_paciente ON resultados (paciente_id, created_at DESC);
CREATE INDEX resultados_by_fecha    ON resultados (fecha_muestra DESC);
CREATE INDEX resultados_by_estado   ON resultados (estado, created_at DESC);

ALTER TABLE presupuestos
  ADD CONSTRAINT presupuestos_resultado_fk
  FOREIGN KEY (resultado_id) REFERENCES resultados (id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- resultados_examenes (ADR-04 snapshot)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE resultados_examenes (
  id                       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  resultado_id             uuid           NOT NULL REFERENCES resultados (id) ON DELETE CASCADE,
  examen_id                uuid           NOT NULL REFERENCES examenes  (id) ON DELETE RESTRICT,
  nombre_snap              text           NOT NULL,
  precio_snap              numeric(12, 2) NOT NULL CHECK (precio_snap >= 0),
  unidad_snap              text,
  valores_referencia_snap  text,
  valor                    text           NOT NULL,
  observacion              text,
  orden                    integer        NOT NULL DEFAULT 0
);

CREATE INDEX resultados_examenes_by_resultado ON resultados_examenes (resultado_id, orden);

-- ─────────────────────────────────────────────────────────────────────────────
-- presupuestos_examenes (ADR-04 snapshot)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE presupuestos_examenes (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id uuid           NOT NULL REFERENCES presupuestos (id) ON DELETE CASCADE,
  examen_id      uuid           NOT NULL REFERENCES examenes     (id) ON DELETE RESTRICT,
  nombre_snap    text           NOT NULL,
  precio_snap    numeric(12, 2) NOT NULL CHECK (precio_snap >= 0),
  orden          integer        NOT NULL DEFAULT 0
);

CREATE INDEX presupuestos_examenes_by_presupuesto ON presupuestos_examenes (presupuesto_id, orden);

-- ─────────────────────────────────────────────────────────────────────────────
-- usuarios
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE usuarios (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid        UNIQUE,
  email         text        NOT NULL,
  nombre        text        NOT NULL,
  role          text        NOT NULL DEFAULT 'operador'
                            CHECK (role IN ('admin', 'operador')),
  activo        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_email_unique UNIQUE (email)
);

CREATE INDEX usuarios_by_email ON usuarios (email);

-- ─────────────────────────────────────────────────────────────────────────────
-- tasa_cambio_bcv
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE tasa_cambio_bcv (
  id          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tasa        numeric(14, 4) NOT NULL CHECK (tasa > 0),
  fecha       timestamptz    NOT NULL,
  fuente      text           NOT NULL CHECK (fuente IN ('bcv', 'dolartoday', 'manual')),
  scraped_at  timestamptz    NOT NULL DEFAULT now(),
  motivo      text,
  created_by  uuid           REFERENCES usuarios (id) ON DELETE SET NULL
);

CREATE INDEX tasa_cambio_bcv_by_fecha ON tasa_cambio_bcv (fecha DESC, scraped_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  accion       text        NOT NULL,
  entity_type  text        NOT NULL,
  entity_id    text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_by_created ON audit_log (created_at DESC);
CREATE INDEX audit_log_by_usuario ON audit_log (usuario_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- migration_map (WP → PG)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE migration_map (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wp_table       text        NOT NULL,
  wp_id          bigint      NOT NULL,
  destino_id     uuid        NOT NULL,
  migrated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT migration_map_wp_unique UNIQUE (wp_table, wp_id)
);

CREATE INDEX migration_map_by_wp ON migration_map (wp_table, wp_id);

COMMIT;
