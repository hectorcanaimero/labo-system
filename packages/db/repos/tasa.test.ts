import { describe, it, expect } from "vitest";

import { setFromScraper } from "./tasa.js";
import type { Db } from "../sdk.js";

/**
 * Guarda anti-outlier de `setFromScraper` (GUR-14).
 *
 * El bug: el rechazo no escribe nada, así que el LKG viejo quedaba congelado y
 * cada scrape posterior volvía a caer fuera de rango → 409 permanente. La salida
 * es ignorar la guarda cuando el LKG está stale (>24h).
 */

const HORA_MS = 60 * 60 * 1000;

/** Db mínima: `getLatest` lee una fila fija, los insert siempre pasan. */
function fakeDb(previous: { tasa: number; horasAtras: number } | null): Db {
  const rows = previous
    ? [
        {
          tasa: previous.tasa,
          fuente: "bcv",
          scraped_at: new Date(Date.now() - previous.horasAtras * HORA_MS).toISOString(),
          motivo: null,
        },
      ]
    : [];

  return {
    from(table: string) {
      const select = () => ({
        order: () => select(),
        limit: async () => ({ data: rows, error: null }),
      });
      return {
        select,
        insert: () => ({
          select: () => ({
            limit: async () => ({ data: [{ id: `${table}-1` }], error: null }),
          }),
          // audit_log inserta sin `.select()`, se awaitea directo.
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        }),
      };
    },
  } as unknown as Db;
}

const scrape = { fuente: "bcv" as const, fecha: "2026-09-04T04:00:00.000Z", scrapedAt: new Date().toISOString() };

describe("setFromScraper — guarda anti-outlier", () => {
  it("rechaza un salto >50% contra un LKG fresco", async () => {
    const out = await setFromScraper(fakeDb({ tasa: 200, horasAtras: 2 }), { tasa: 807.39, ...scrape });
    expect(out.skipped).toBe(true);
    expect(out.reason).toMatch(/^variacion_/);
  });

  it("acepta el mismo salto cuando el LKG está stale (>24h) — sin esto el 409 es permanente", async () => {
    const out = await setFromScraper(fakeDb({ tasa: 200, horasAtras: 30 }), { tasa: 807.39, ...scrape });
    expect(out.skipped).toBe(false);
    expect(out.id).toBeTruthy();
  });

  it("acepta una variación normal contra un LKG fresco", async () => {
    const out = await setFromScraper(fakeDb({ tasa: 800, horasAtras: 1 }), { tasa: 807.39, ...scrape });
    expect(out.skipped).toBe(false);
  });

  it("es fail-closed con una tasa inválida", async () => {
    await expect(
      setFromScraper(fakeDb({ tasa: 800, horasAtras: 1 }), { tasa: 0, ...scrape }),
    ).rejects.toThrow(/tasa inválida/);
  });
});
