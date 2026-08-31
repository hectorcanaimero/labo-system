import type { Db } from "../sdk";

export type UserRole = "admin" | "operador";

export interface Usuario {
  id: string;
  auth_user_id: string | null;
  email: string;
  nombre: string;
  role: UserRole;
  activo: boolean;
  created_at: string;
}

const USUARIO_COLS =
  "id, auth_user_id, email, nombre, role, activo, created_at";

export interface SyncUsuarioInput {
  authUserId: string;
  email: string;
  nombre?: string;
  role?: UserRole;
}

export async function getByAuthUserId(
  db: Db,
  authUserId: string,
): Promise<Usuario | null> {
  const { data, error } = await db
    .from("usuarios")
    .select(USUARIO_COLS)
    .eq("auth_user_id", authUserId)
    .limit(1);
  if (error) throw new Error(`usuarios.getByAuthUserId: ${error.message}`);
  return (data?.[0] as Usuario) ?? null;
}

export async function getByEmail(db: Db, email: string): Promise<Usuario | null> {
  const { data, error } = await db
    .from("usuarios")
    .select(USUARIO_COLS)
    .ilike("email", email)
    .limit(1);
  if (error) throw new Error(`usuarios.getByEmail: ${error.message}`);
  return (data?.[0] as Usuario) ?? null;
}

/**
 * Sincroniza el perfil de dominio con el user de InsForge Auth.
 *
 * - Si NO existe: INSERT con `role` default `operador` (o el que llegue en input).
 * - Si EXISTE: solo actualiza `email`/`nombre` si cambiaron en Auth. **NUNCA
 *   pisa el `role`** (evita que un admin sea degradado a operador en cada
 *   login).
 *
 * Pre-relink: si el email existe con OTRO auth_user_id (rotación de id en
 * Auth), actualiza el vínculo antes del upsert para no chocar con UNIQUE email.
 */
export async function syncFromAuth(
  db: Db,
  input: SyncUsuarioInput,
): Promise<Usuario> {
  const nombre = input.nombre?.trim().length ? input.nombre.trim() : input.email;

  // Relink: si el email ya existe con OTRO auth_user_id, actualizar antes.
  await db
    .from("usuarios")
    .update({ auth_user_id: input.authUserId })
    .ilike("email", input.email)
    .neq("auth_user_id", input.authUserId);

  // ¿Ya existe?
  const existing = await getByAuthUserId(db, input.authUserId);

  if (existing) {
    // Actualizar solo campos que cambiaron. Nunca tocamos `role`.
    const patch: Record<string, unknown> = {};
    if (existing.email !== input.email) patch.email = input.email;
    if (existing.nombre !== nombre) patch.nombre = nombre;

    if (Object.keys(patch).length === 0) return existing;

    const { data, error } = await db
      .from("usuarios")
      .update(patch)
      .eq("id", existing.id)
      .select(USUARIO_COLS)
      .limit(1);
    if (error) throw new Error(`usuarios.syncFromAuth (update): ${error.message}`);
    const row = data?.[0] as Usuario | undefined;
    return row ?? existing;
  }

  // No existía: INSERT con role default o el que venga en input.
  const role = input.role ?? "operador";
  const { data, error } = await db
    .from("usuarios")
    .insert({
      auth_user_id: input.authUserId,
      email: input.email,
      nombre,
      role,
    })
    .select(USUARIO_COLS)
    .limit(1);

  if (error) throw new Error(`usuarios.syncFromAuth (insert): ${error.message}`);
  const row = data?.[0] as Usuario | undefined;
  if (!row) throw new Error("usuarios.syncFromAuth: sin fila retornada");
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log helpers
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

export async function logAuthEvent(
  db: Db,
  input: AuthAuditInput,
): Promise<void> {
  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    ...(input.emailIntent
      ? { email_intent: input.emailIntent.toLowerCase() }
      : {}),
  };
  const { error } = await db.from("audit_log").insert({
    usuario_id: input.usuarioId,
    accion: input.action,
    entity_type: "auth",
    entity_id: input.usuarioId,
    metadata,
  });
  if (error) console.error("usuarios.logAuthEvent:", error.message);
}

export async function countRecentLoginFailures(
  db: Db,
  email: string,
  windowMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("accion", "auth.login_failed")
    .gte("created_at", cutoff)
    .eq("metadata->>email_intent", email.toLowerCase());
  if (error) throw new Error(`usuarios.countLoginFailures: ${error.message}`);
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invitaciones (F0.2.T7)
// ─────────────────────────────────────────────────────────────────────────────

export interface UserInvitation {
  id: string;
  email: string;
  role: UserRole;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted: boolean;
  created_at: string;
}

const INVITATION_COLS =
  "id, email, role, token_hash, invited_by, expires_at, accepted, created_at";

export interface CreateInvitationInput {
  email: string;
  role: UserRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}

export async function createInvitation(
  db: Db,
  input: CreateInvitationInput,
): Promise<UserInvitation> {
  const { data, error } = await db
    .from("user_invitations")
    .insert({
      email: input.email,
      role: input.role,
      token_hash: input.tokenHash,
      invited_by: input.invitedBy,
      expires_at: input.expiresAt.toISOString(),
    })
    .select(INVITATION_COLS)
    .limit(1);
  if (error) throw new Error(`usuarios.createInvitation: ${error.message}`);
  const row = data?.[0] as UserInvitation | undefined;
  if (!row) throw new Error("usuarios.createInvitation: sin fila retornada");
  return row;
}

export async function getInvitationByTokenHash(
  db: Db,
  tokenHash: string,
): Promise<UserInvitation | null> {
  const { data, error } = await db
    .from("user_invitations")
    .select(INVITATION_COLS)
    .eq("token_hash", tokenHash)
    .limit(1);
  if (error) throw new Error(`usuarios.getInvitationByTokenHash: ${error.message}`);
  return (data?.[0] as UserInvitation) ?? null;
}

export async function markInvitationAccepted(
  db: Db,
  id: string,
): Promise<void> {
  const { error } = await db
    .from("user_invitations")
    .update({ accepted: true })
    .eq("id", id);
  if (error) throw new Error(`usuarios.markInvitationAccepted: ${error.message}`);
}

export type PendingInvitation = Pick<
  UserInvitation,
  "id" | "email" | "role" | "expires_at" | "created_at"
>;

export async function listPendingInvitations(
  db: Db,
): Promise<PendingInvitation[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("user_invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("accepted", false)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`usuarios.listPendingInvitations: ${error.message}`);
  return (data ?? []) as PendingInvitation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de usuarios (F9)
// ─────────────────────────────────────────────────────────────────────────────

export async function listAll(db: Db): Promise<Usuario[]> {
  const { data, error } = await db
    .from("usuarios")
    .select(USUARIO_COLS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`usuarios.listAll: ${error.message}`);
  return (data ?? []) as Usuario[];
}

export async function updateRole(
  db: Db,
  id: string,
  role: UserRole,
): Promise<Usuario> {
  const { data, error } = await db
    .from("usuarios")
    .update({ role })
    .eq("id", id)
    .select(USUARIO_COLS)
    .limit(1);
  if (error) throw new Error(`usuarios.updateRole: ${error.message}`);
  const row = data?.[0] as Usuario | undefined;
  if (!row) throw new Error("usuarios.updateRole: sin fila retornada");
  return row;
}

export async function setActivo(
  db: Db,
  id: string,
  activo: boolean,
): Promise<Usuario> {
  const { data, error } = await db
    .from("usuarios")
    .update({ activo })
    .eq("id", id)
    .select(USUARIO_COLS)
    .limit(1);
  if (error) throw new Error(`usuarios.setActivo: ${error.message}`);
  const row = data?.[0] as Usuario | undefined;
  if (!row) throw new Error("usuarios.setActivo: sin fila retornada");
  return row;
}
