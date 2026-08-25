import { v, type GenericId } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Ventana de rate limit para intentos fallidos de login.
 *
 * 15 minutos, como indica ARCH §7.3.
 */
const LOGIN_FAILED_WINDOW_MS = 15 * 60 * 1000;

/**
 * Máximo de intentos fallidos permitidos dentro de la ventana.
 *
 * El 6to intento es bloqueado (es decir, se bloquea al superar 5).
 */
const MAX_LOGIN_FAILED_ATTEMPTS = 5;

/**
 * Inserta un evento de login exitoso en `audit_log`.
 *
 * Se invoca desde el hook `beforeSessionCreation` de Convex Auth, que corre
 * en contexto de mutation y ya tiene el `userId` de autenticación.
 */
export async function recordLoginSuccess(
  ctx: MutationCtx,
  authUserId: GenericId<"users">
) {
  const authUser = (await ctx.db.get(authUserId)) as Doc<"users"> | null;
  const email = authUser?.email;
  if (!email) return;

  const usuario = await ctx.db
    .query("usuarios")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  await ctx.db.insert("audit_log", {
    usuario_id: usuario?._id,
    accion: "auth.login",
    entity_type: "auth",
    metadata: {},
    created_at: Date.now(),
  });
}

/**
 * Determina si un email debe ser bloqueado por demasiados intentos fallidos.
 */
export const isLoginBlocked = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.toLowerCase().trim();
    const since = Date.now() - LOGIN_FAILED_WINDOW_MS;
    const recentAttempts = await ctx.db
      .query("audit_log")
      .withIndex("by_created", (q) => q.gte("created_at", since))
      .collect();

    const failedAttempts = recentAttempts.filter(
      (entry) =>
        entry.accion === "auth.login_failed" &&
        typeof entry.metadata === "object" &&
        entry.metadata !== null &&
        (entry.metadata as { email_intent?: string }).email_intent ===
          normalizedEmail
    );

    return failedAttempts.length >= MAX_LOGIN_FAILED_ATTEMPTS;
  },
});

/**
 * Registra un intento de login fallido.
 */
export const recordLoginFailed = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await ctx.db.insert("audit_log", {
      accion: "auth.login_failed",
      entity_type: "auth",
      metadata: { email_intent: email.toLowerCase().trim() },
      created_at: Date.now(),
    });
  },
});

/**
 * Registra un cierre de sesión.
 */
export const recordLogout = internalMutation({
  args: { authUserId: v.id("users") },
  handler: async (ctx, { authUserId }) => {
  const authUser = (await ctx.db.get(authUserId)) as Doc<"users"> | null;
  const email = authUser?.email;
  if (!email) return;

  const usuario = await ctx.db
    .query("usuarios")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  await ctx.db.insert("audit_log", {
    usuario_id: usuario?._id,
    accion: "auth.logout",
    entity_type: "auth",
    metadata: {},
    created_at: Date.now(),
  });
  },
});

/**
 * Registra el cleanup semanal de los archivos de exportación vencidos.
 */
export const recordCleanupExports = mutation({
  args: {
    secret: v.string(),
    countDeleted: v.number(),
    deletedKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.CRON_SECRET) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    await ctx.db.insert("audit_log", {
      accion: "cron.cleanup-exports",
      entity_type: "storage_bucket",
      entity_id: "exports",
      metadata: {
        count_deleted: args.countDeleted,
        deleted_keys: args.deletedKeys,
      },
      created_at: now,
    });
  },
});
