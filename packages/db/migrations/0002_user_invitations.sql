-- =============================================================================
-- Migración 0002_user_invitations — Tabla de invitaciones de usuario.
--
-- Refs: ADR-11, F0.2.T7.
-- Aplicar forward-only vía InsForge CLI o `psql -f`.
-- =============================================================================

BEGIN;

CREATE TABLE user_invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('admin', 'operador')),
  token_hash  text        NOT NULL,
  invited_by  uuid        NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  expires_at  timestamptz NOT NULL,
  accepted    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_invitations_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX user_invitations_by_email   ON user_invitations (lower(email));
CREATE INDEX user_invitations_by_pending ON user_invitations (expires_at, accepted) WHERE NOT accepted;

COMMIT;
