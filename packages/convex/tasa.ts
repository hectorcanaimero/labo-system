import { query } from "./_generated/server";

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
