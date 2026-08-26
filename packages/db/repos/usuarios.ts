import type { Sql } from "postgres";

export type UserRole = "admin" | "operador";

export interface Usuario {
  id: string;
  auth_user_id: string | null;
  email: string;
  nombre: string;
  role: UserRole;
  activo: boolean;
  created_at: Date;
}

export interface SyncUsuarioInput {
  authUserId: string;
  email: string;
  nombre?: string;
  role?: UserRole;
}

/**
 * Devuelve la fila `usuarios` vinculada a un `auth_user_id` de InsForge Auth.
 * Retorna `null` si no existe (todavía no se sincronizó).
 */
export async function getByAuthUserId(
  sql: Sql,
  authUserId: string,
): Promise<Usuario | null> {
  const rows = await sql<Usuario[]>`
    SELECT id, auth_user_id, email, nombre, role, activo, created_at
    FROM usuarios
    WHERE auth_user_id = ${authUserId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getByEmail(
  sql: Sql,
  email: string,
): Promise<Usuario | null> {
  const rows = await sql<Usuario[]>`
    SELECT id, auth_user_id, email, nombre, role, activo, created_at
    FROM usuarios
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Upsert idempotente por `auth_user_id`. Si la fila no existe la crea con
 * `role` default `operador` (ARCH §7.2). Si existe y el email cambió en
 * InsForge, actualiza el email de dominio para mantener consistencia.
 *
 * Se llama post-login exitoso (F0.2.T8) y post-alta desde invitación (F0.2.T7).
 * `role` default en INSERT respeta el CHECK constraint del schema.
 */
export async function syncFromAuth(
  sql: Sql,
  input: SyncUsuarioInput,
): Promise<Usuario> {
  const nombre = input.nombre?.trim().length ? input.nombre.trim() : input.email;
  const role = input.role ?? "operador";

  // Relink: si el email existe con OTRO auth_user_id (rotación de id en
  // InsForge: borrado+recreado, merge de cuentas), actualizamos el vínculo
  // antes del upsert — si no, el INSERT pega contra usuarios_email_unique.
  await sql`
    UPDATE usuarios
    SET auth_user_id = ${input.authUserId}
    WHERE lower(email) = lower(${input.email})
      AND auth_user_id <> ${input.authUserId}
  `;

  const rows = await sql<Usuario[]>`
    INSERT INTO usuarios (auth_user_id, email, nombre, role)
    VALUES (${input.authUserId}, ${input.email}, ${nombre}, ${role})
    ON CONFLICT (auth_user_id) DO UPDATE
      SET email = EXCLUDED.email
    RETURNING id, auth_user_id, email, nombre, role, activo, created_at
  `;
  return rows[0]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log helpers (F0.2.T8: eventos de auth)
// ─────────────────────────────────────────────────────────────────────────────

export type AuthAction =
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "auth.login_blocked";

export interface AuthAuditInput {
  usuarioId: string | null;
  action: AuthAction;
  emailIntent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Inserta una fila en `audit_log` para eventos de auth.
 *
 * - `usuarioId` es la FK a `usuarios(id)` (no al `auth_user_id`); en fallos de
 *   login puede ser NULL si el email no matchea ningún usuario.
 * - `email_intent` va en `metadata` (spec F0.2.T8) para poder correlacionar
 *   intentos fallidos por email sin exponer la existencia del usuario.
 */
export async function logAuthEvent(
  sql: Sql,
  input: AuthAuditInput,
): Promise<void> {
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.emailIntent ? { email_intent: input.emailIntent } : {}),
  };
  await sql`
    INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
    VALUES (
      ${input.usuarioId},
      ${input.action},
      ${"auth"},
      ${input.usuarioId},
      ${sql.json(metadata)}
    )
  `;
}

/**
 * Rate limit lógico spec F0.2.T8: >5 fallos en 15min por email → bloquear.
 *
 * Consulta `audit_log` por `auth.login_failed` cuyo `metadata->>email_intent`
 * matchee el email (case-insensitive) en la ventana. No usa `authRateLimits`
 * nativo de InsForge porque el bloqueo es por email (no por auth_user_id, que
 * no existe cuando el login falla).
 */
export async function countRecentLoginFailures(
  sql: Sql,
  email: string,
  windowMs: number,
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM audit_log
    WHERE accion = 'auth.login_failed'
      AND created_at > now() - (${windowMs} || ' milliseconds')::interval
      AND lower(metadata->>'email_intent') = lower(${email})
  `;
  return Number(rows[0]?.count ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Invitaciones de usuario (F0.2.T7)
// ─────────────────────────────────────────────────────────────────────────────

export interface UserInvitation {
  id: string;
  email: string;
  role: UserRole;
  token_hash: string;
  invited_by: string;
  expires_at: Date;
  accepted: boolean;
  created_at: Date;
}

export interface CreateInvitationInput {
  email: string;
  role: UserRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}

export async function createInvitation(
  sql: Sql,
  input: CreateInvitationInput,
): Promise<UserInvitation> {
  const rows = await sql<UserInvitation[]>`
    INSERT INTO user_invitations (email, role, token_hash, invited_by, expires_at)
    VALUES (${input.email}, ${input.role}, ${input.tokenHash}, ${input.invitedBy}, ${input.expiresAt})
    RETURNING id, email, role, token_hash, invited_by, expires_at, accepted, created_at
  `;
  return rows[0]!;
}

export async function getInvitationByTokenHash(
  sql: Sql,
  tokenHash: string,
): Promise<UserInvitation | null> {
  const rows = await sql<UserInvitation[]>`
    SELECT id, email, role, token_hash, invited_by, expires_at, accepted, created_at
    FROM user_invitations
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function markInvitationAccepted(
  sql: Sql,
  id: string,
): Promise<void> {
  await sql`
    UPDATE user_invitations SET accepted = true WHERE id = ${id}
  `;
}

export type PendingInvitation = Pick<
  UserInvitation,
  "id" | "email" | "role" | "expires_at" | "created_at"
>;

export async function listPendingInvitations(
  sql: Sql,
): Promise<PendingInvitation[]> {
  return sql<PendingInvitation[]>`
    SELECT id, email, role, expires_at, created_at
    FROM user_invitations
    WHERE NOT accepted AND expires_at > now()
    ORDER BY created_at DESC
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de usuarios (F9 — listado y administración de roles)
// ─────────────────────────────────────────────────────────────────────────────

export async function listAll(sql: Sql): Promise<Usuario[]> {
  return sql<Usuario[]>`
    SELECT id, auth_user_id, email, nombre, role, activo, created_at
    FROM usuarios
    ORDER BY created_at ASC
  `;
}

export async function updateRole(
  sql: Sql,
  id: string,
  role: UserRole,
): Promise<Usuario> {
  const rows = await sql<Usuario[]>`
    UPDATE usuarios
    SET role = ${role}
    WHERE id = ${id}
    RETURNING id, auth_user_id, email, nombre, role, activo, created_at
  `;
  return rows[0]!;
}

export async function setActivo(
  sql: Sql,
  id: string,
  activo: boolean,
): Promise<Usuario> {
  const rows = await sql<Usuario[]>`
    UPDATE usuarios
    SET activo = ${activo}
    WHERE id = ${id}
    RETURNING id, auth_user_id, email, nombre, role, activo, created_at
  `;
  return rows[0]!;
}
