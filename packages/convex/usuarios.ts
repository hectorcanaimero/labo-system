import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireRole, type Role } from "./helpers/auth.js";

/**
 * Retorna el usuario actual con su rol.
 *
 * Usado por el header del frontend para mostrar el usuario logueado.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

/**
 * Lista todos los perfiles de usuario (solo Admin).
 *
 * Usado para gestión de usuarios desde dashboard o scripts one-shot.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("usuarios").collect();
  },
});

/**
 * Actualiza el rol de un usuario (solo Admin).
 */
export const updateRole = mutation({
  args: {
    userId: v.id("usuarios"),
    role: v.union(v.literal("admin"), v.literal("operador")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.patch(args.userId, { role: args.role as Role });
  },
});
