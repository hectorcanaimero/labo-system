import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v, type Value } from "convex/values";
import { action } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { recordLoginSuccess } from "./audit.js";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

/**
 * Configuración central de Convex Auth.
 *
 * - Provider: Password (email + password).
 * - Sesión máxima: 8h (requisito ARCH ADR-03 / S5).
 * - Hook post-signup: sincroniza el perfil de dominio en `usuarios` con
 *   rol default "operador" (F0.auth.T04).
 * - Hook pre-creación de sesión: registra `auth.login` en `audit_log`
 *   (F0.auth.T05).
 *
 * Nota: Convex Auth expone la opción como `session.totalDurationMs`, no
 * `session.durationMs`. Ver:
 * https://labs.convex.dev/auth/api_reference/server
 */
const authSetup = convexAuth({
  providers: [Password],
  session: {
    totalDurationMs: EIGHT_HOURS_MS,
  },
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { existingUserId, profile }) {
      // Solo actuar en la creación inicial. Si el usuario ya existe,
      // no sobreescribimos su perfil de dominio.
      if (existingUserId !== null) return;

      const email = profile.email;
      if (!email) return;

      const mCtx = ctx as MutationCtx;

      const existing = await mCtx.db
        .query("usuarios")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();

      if (existing) return;

      const nombre =
        typeof profile.name === "string" && profile.name.length > 0
          ? profile.name
          : email.split("@")[0];

      await mCtx.db.insert("usuarios", {
        email,
        nombre,
        role: "operador",
        activo: true,
        created_at: Date.now(),
      });
    },
    async beforeSessionCreation(ctx, { userId }) {
      // Convex Auth no expone un hook post-signin; este callback corre
      // inmediatamente antes de persistir la sesión, cuando las credenciales
      // ya fueron validadas.
      await recordLoginSuccess(ctx as MutationCtx, userId);
    },
  },
});

const convexSignIn = authSetup.signIn as unknown as (
  ctx: ActionCtx,
  args: {
    provider?: string;
    params?: Record<string, Value | undefined>;
    verifier?: string;
    refreshToken?: string;
    calledBy?: string;
  }
) => Promise<{
  redirect?: string;
  verifier?: string;
  tokens?: { token: string; refreshToken: string } | null;
  started?: boolean;
}>;

const convexSignOut = authSetup.signOut as unknown as (
  ctx: ActionCtx
) => Promise<void>;

export const { auth, store, isAuthenticated } = authSetup;

/**
 * Wrapper sobre la action `signIn` de Convex Auth.
 *
 * Agrega:
 * - Rate limit lógico por email (> 5 `auth.login_failed` en 15 min).
 * - Registro de intentos fallidos (`auth.login_failed`).
 * - Conversión de credenciales inválidas a un error genérico.
 *
 * El login exitoso se registra en `beforeSessionCreation` (ver arriba).
 */
export const signIn = action({
  args: {
    provider: v.optional(v.string()),
    params: v.optional(v.any()),
    verifier: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    calledBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const params = args.params ?? {};
    const rawEmail =
      typeof params.email === "string" ? params.email : undefined;
    const email = rawEmail?.toLowerCase().trim();
    const isPasswordSignIn =
      args.provider === "password" && params.flow === "signIn";

    if (isPasswordSignIn && email) {
      const blocked = await ctx.runQuery(internal.audit.isLoginBlocked, { email });
      if (blocked) {
        await ctx.runMutation(internal.audit.recordLoginFailed, { email });
        throw new ConvexError("credenciales inválidas");
      }
    }

    let result: Awaited<ReturnType<typeof convexSignIn>>;
    try {
      result = await convexSignIn(ctx, args);
    } catch (error) {
      if (isPasswordSignIn && email) {
        await ctx.runMutation(internal.audit.recordLoginFailed, { email });
      }
      throw error;
    }

    if (isPasswordSignIn && email && !result.tokens) {
      await ctx.runMutation(internal.audit.recordLoginFailed, { email });
      throw new ConvexError("credenciales inválidas");
    }

    return result;
  },
});

/**
 * Wrapper sobre la action `signOut` de Convex Auth.
 *
 * Registra `auth.logout` en `audit_log` con el usuario actual.
 */
export const signOut = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    await convexSignOut(ctx);
    if (userId !== null) {
      await ctx.runMutation(internal.audit.recordLogout, { authUserId: userId });
    }
  },
});
