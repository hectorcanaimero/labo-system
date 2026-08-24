import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth.js";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Errores específicos del dominio de títulos de exámenes.
 */
export const TITULO_DUPLICADO = "TITULO_DUPLICADO";
export const TITULO_TIENE_EXAMENES = "TITULO_TIENE_EXAMENES";
export const TITULO_NO_ENCONTRADO = "TITULO_NO_ENCONTRADO";

/**
 * Normaliza un nombre para comparación de unicidad.
 */
function normalizeName(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/**
 * Verifica que no exista otro título con el mismo nombre.
 *
 * Como el schema no declara índice único, hacemos una comparación
 * case-insensitive en memoria. El catálogo de títulos es pequeño,
 * por lo que el costo es aceptable.
 */
async function assertNombreUnico(
  ctx: MutationCtx,
  nombre: string,
  excludeId?: Id<"examenes_titulos">
): Promise<void> {
  const normalized = normalizeName(nombre);
  const todos = await ctx.db.query("examenes_titulos").collect();
  const duplicado = todos.find(
    (t) =>
      normalizeName(t.nombre) === normalized &&
      (!excludeId || t._id !== excludeId)
  );
  if (duplicado) {
    throw new Error(TITULO_DUPLICADO);
  }
}

/**
 * Registra un cambio en `audit_log`.
 */
async function logAudit(
  ctx: MutationCtx,
  args: {
    usuario_id: Id<"usuarios">;
    accion: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await ctx.db.insert("audit_log", {
    usuario_id: args.usuario_id,
    accion: args.accion,
    entity_type: "examenes_titulos",
    entity_id: args.entity_id,
    metadata: args.metadata ?? {},
    created_at: Date.now(),
  });
}

// =============================================================================
// Títulos / grupos de exámenes
// =============================================================================

/**
 * Lista todos los títulos ordenados por `orden` ascendente.
 *
 * Público: cualquier usuario autenticado puede leer el catálogo.
 */
export const titulosList = query({
  args: {},
  handler: async (ctx) => {
    const titulos = await ctx.db.query("examenes_titulos").collect();
    return titulos.sort((a, b) => a.orden - b.orden);
  },
});

/**
 * Crea un nuevo título (grupo) de exámenes.
 *
 * Solo administradores. Rechaza nombres duplicados (case-insensitive).
 */
export const titulosCreate = mutation({
  args: {
    nombre: v.string(),
    orden: v.number(),
  },
  handler: async (ctx, { nombre, orden }) => {
    const user = await requireRole(ctx, "admin");
    await assertNombreUnico(ctx, nombre);

    const id = await ctx.db.insert("examenes_titulos", {
      nombre: nombre.trim(),
      orden,
      created_at: Date.now(),
    });

    await logAudit(ctx, {
      usuario_id: user._id,
      accion: "examenes_titulos.create",
      entity_id: id,
      metadata: { nombre: nombre.trim(), orden },
    });

    return id;
  },
});

/**
 * Actualiza el nombre y/o orden de un título.
 *
 * Solo administradores. Si cambia el nombre, valida unicidad.
 */
export const titulosUpdate = mutation({
  args: {
    id: v.id("examenes_titulos"),
    nombre: v.optional(v.string()),
    orden: v.optional(v.number()),
  },
  handler: async (ctx, { id, nombre, orden }) => {
    const user = await requireRole(ctx, "admin");

    const titulo = await ctx.db.get(id);
    if (!titulo) {
      throw new Error(TITULO_NO_ENCONTRADO);
    }

    if (nombre !== undefined) {
      await assertNombreUnico(ctx, nombre, id);
    }

    const patch: { nombre?: string; orden?: number } = {};
    if (nombre !== undefined) patch.nombre = nombre.trim();
    if (orden !== undefined) patch.orden = orden;

    await ctx.db.patch(id, patch);

    await logAudit(ctx, {
      usuario_id: user._id,
      accion: "examenes_titulos.update",
      entity_id: id,
      metadata: {
        anterior: { nombre: titulo.nombre, orden: titulo.orden },
        nuevo: patch,
      },
    });

    return id;
  },
});

/**
 * Elimina un título.
 *
 * Solo administradores. Rechaza si tiene exámenes hijos activos.
 */
export const titulosDelete = mutation({
  args: {
    id: v.id("examenes_titulos"),
  },
  handler: async (ctx, { id }) => {
    const user = await requireRole(ctx, "admin");

    const titulo = await ctx.db.get(id);
    if (!titulo) {
      throw new Error(TITULO_NO_ENCONTRADO);
    }

    const hijosActivos = await ctx.db
      .query("examenes")
      .withIndex("by_titulo", (q) => q.eq("titulo_id", id))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();

    if (hijosActivos.length > 0) {
      throw new Error(TITULO_TIENE_EXAMENES);
    }

    await ctx.db.delete(id);

    await logAudit(ctx, {
      usuario_id: user._id,
      accion: "examenes_titulos.delete",
      entity_id: id,
      metadata: { nombre: titulo.nombre, orden: titulo.orden },
    });

    return id;
  },
});

/**
 * Reordena los títulos asignando `orden` según el array recibido.
 *
 * Solo administradores. Cada ID recibe `orden = índice + 1`.
 */
export const titulosReorder = mutation({
  args: {
    orderedIds: v.array(v.id("examenes_titulos")),
  },
  handler: async (ctx, { orderedIds }) => {
    const user = await requireRole(ctx, "admin");

    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const titulo = await ctx.db.get(id);
      if (!titulo) {
        throw new Error(TITULO_NO_ENCONTRADO);
      }
      await ctx.db.patch(id, { orden: i + 1 });
    }

    await logAudit(ctx, {
      usuario_id: user._id,
      accion: "examenes_titulos.reorder",
      metadata: { orderedIds },
    });

    return orderedIds;
  },
});
