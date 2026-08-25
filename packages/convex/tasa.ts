import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./helpers/auth.js";

/**
 * Umbral de staleness: 24 horas en milisegundos.
 *
 * Si la última tasa fue scrapeada hace más de este tiempo se marca
 * como `stale` para que el UI pueda advertir al usuario.
 */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Retorna la última tasa de cambio registrada en `tasa_cambio_bcv`.
 *
 * El resultado incluye un flag computado `stale` que indica si la tasa
 * tiene más de 24 horas desde su `scraped_at`.  Retorna `null` cuando
 * la tabla aún no tiene registros (primer arranque o antes de que
 * alguien cargue una tasa manual o el scraper BCV corra).
 */
export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db
      .query("tasa_cambio_bcv")
      .withIndex("by_fecha", (q) => q)
      .order("desc")
      .first();

    if (!latest) {
      return null;
    }

    const isStale = Date.now() - latest.scraped_at > STALE_THRESHOLD_MS;

    return {
      ...latest,
      stale: isStale,
    };
  },
});

/**
 * Registra una tasa de cambio de forma manual (solo Admin).
 *
 * Inserta la tasa con `fuente: "manual"`, `scraped_at: Date.now()`,
 * y deja registro en `audit_log`.
 */
export const setManual = mutation({
  args: {
    tasa: v.number(),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");
    const now = Date.now();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fecha = today.getTime();

    const id = await ctx.db.insert("tasa_cambio_bcv", {
      tasa: args.tasa,
      fecha,
      fuente: "manual",
      scraped_at: now,
      motivo: args.motivo,
      created_by: user._id,
    });

    await ctx.db.insert("audit_log", {
      usuario_id: user._id,
      accion: "tasa.setManual",
      entity_type: "tasa_cambio_bcv",
      entity_id: id,
      metadata: { tasa: args.tasa, motivo: args.motivo },
      created_at: now,
    });

    return id;
  },
});
