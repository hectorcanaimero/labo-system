import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Roles soportados por LabSystem.
 *
 * Ver ARCH §7.2 (RBAC).
 */
export type Role = "admin" | "operador";

/**
 * Error lanzado cuando no hay sesión activa o el usuario no tiene
 * perfil de dominio en `usuarios`.
 */
export const UNAUTHENTICATED = "UNAUTHENTICATED";

/**
 * Error lanzado cuando el usuario autenticado no tiene el rol requerido.
 */
export const UNAUTHORIZED = "UNAUTHORIZED";

/**
 * Perfil mínimo del usuario devuelto por los helpers de auth.
 */
export type CurrentUser = {
  _id: Id<"usuarios">;
  email: string;
  role: Role;
};

type AuthCtx = QueryCtx | MutationCtx;

/**
 * Retorna el usuario de dominio actual a partir de la sesión de Convex Auth.
 *
 * Lanza `UNAUTHENTICATED` si no hay sesión o si no existe fila en `usuarios`.
 */
export async function getCurrentUser(ctx: AuthCtx): Promise<CurrentUser> {
  const identity = await ctx.auth.getUserIdentity();
  const email = identity?.email;
  if (!email) {
    throw new Error(UNAUTHENTICATED);
  }

  const usuario = await ctx.db
    .query("usuarios")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  if (!usuario) {
    throw new Error(UNAUTHENTICATED);
  }

  return {
    _id: usuario._id,
    email: usuario.email,
    role: usuario.role,
  };
}

/**
 * Verifica que el usuario actual tenga el rol solicitado.
 *
 * Lanza `UNAUTHORIZED` si el rol no coincide.
 * Devuelve el usuario actual para encadenar lógica.
 */
export async function requireRole(
  ctx: AuthCtx,
  role: Role
): Promise<CurrentUser> {
  const user = await getCurrentUser(ctx);
  if (user.role !== role) {
    throw new Error(UNAUTHORIZED);
  }
  return user;
}
