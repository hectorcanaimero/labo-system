import { describe, it, expect } from "vitest";

import { MOTIVO_REQUERIDO_PARA_FORZAR, setFromScraper, setManual } from "./tasa.js";
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

/**
 * Igual que `fakeDb` pero registra los insert por tabla: hace falta para
 * afirmar que un rechazo deja fila en `audit_log`, que es justo lo que antes
 * no pasaba (el rechazo devolvía temprano sin escribir nada).
 */
function fakeDbConRegistro(previous: { tasa: number; horasAtras: number } | null) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
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

  const db = {
    from(table: string) {
      const select = () => ({
        order: () => select(),
        limit: async () => ({ data: rows, error: null }),
      });
      return {
        select,
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              limit: async () => ({ data: [{ id: `${table}-1` }], error: null }),
            }),
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          };
        },
      };
    },
  } as unknown as Db;

  const auditoria = (accion: string) =>
    inserts.filter((i) => i.table === "audit_log" && i.payload.accion === accion);

  return { db, inserts, auditoria };
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

/**
 * `setManual` no tenía guarda anti-outlier (F7.5.T1): cualquier valor se
 * guardaba con éxito silencioso. Reusa la misma lógica de `setFromScraper`.
 */
describe("setManual — guarda anti-outlier", () => {
  const manualInput = { motivo: undefined, usuarioId: "u-1" };

  it("rechaza un salto >50% contra un LKG fresco y devuelve la tasa anterior", async () => {
    const out = await setManual(fakeDb({ tasa: 200, horasAtras: 2 }), {
      tasa: 807.39,
      ...manualInput,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toMatch(/^variacion_/);
    expect(out.tasaAnterior).toBe(200);
    expect(out.id).toBeNull();
  });

  it("acepta el mismo salto cuando el LKG está stale (>24h)", async () => {
    const out = await setManual(fakeDb({ tasa: 200, horasAtras: 30 }), {
      tasa: 807.39,
      ...manualInput,
    });
    expect(out.skipped).toBe(false);
    expect(out.id).toBeTruthy();
  });

  it("acepta una variación normal contra un LKG fresco", async () => {
    const out = await setManual(fakeDb({ tasa: 800, horasAtras: 1 }), {
      tasa: 807.39,
      ...manualInput,
    });
    expect(out.skipped).toBe(false);
  });

  it("acepta la primera tasa cuando no hay LKG", async () => {
    const out = await setManual(fakeDb(null), { tasa: 807.39, ...manualInput });
    expect(out.skipped).toBe(false);
    expect(out.id).toBeTruthy();
  });
});

/**
 * F7.3.T4 — la guarda era un callejón sin salida: si la tasa se movía de
 * verdad más que el umbral, el admin no podía cargarla hasta que el LKG se
 * pusiera stale a las 24h, y el scraper tampoco podía refrescarlo porque
 * comparte la guarda. Y el rechazo no dejaba rastro en ninguna parte.
 */
describe("setManual — forzado con motivo", () => {
  it("con force guarda la tasa que la guarda había rechazado", async () => {
    const { db } = fakeDbConRegistro({ tasa: 200, horasAtras: 2 });
    const out = await setManual(db, {
      tasa: 807.39,
      motivo: "Devaluación del 7/9 confirmada en el BCV",
      usuarioId: "u-1",
      force: true,
    });

    expect(out.skipped).toBe(false);
    expect(out.id).toBeTruthy();
  });

  it("forzar sin motivo se rechaza y no escribe nada", async () => {
    const { db, inserts } = fakeDbConRegistro({ tasa: 200, horasAtras: 2 });

    await expect(
      setManual(db, { tasa: 807.39, usuarioId: "u-1", force: true }),
    ).rejects.toThrow(MOTIVO_REQUERIDO_PARA_FORZAR);

    expect(inserts).toHaveLength(0);
  });

  it("forzar con motivo en blanco tampoco alcanza", async () => {
    const { db } = fakeDbConRegistro({ tasa: 200, horasAtras: 2 });
    await expect(
      setManual(db, { tasa: 807.39, motivo: "   ", usuarioId: "u-1", force: true }),
    ).rejects.toThrow(MOTIVO_REQUERIDO_PARA_FORZAR);
  });

  it("el forzado queda auditado con tasa anterior, nueva y motivo", async () => {
    const { db, auditoria } = fakeDbConRegistro({ tasa: 200, horasAtras: 2 });
    await setManual(db, {
      tasa: 807.39,
      motivo: "Devaluación confirmada",
      usuarioId: "u-1",
      force: true,
    });

    const filas = auditoria("tasa.setManual");
    expect(filas).toHaveLength(1);
    expect(filas[0]?.payload.metadata).toMatchObject({
      tasa: 807.39,
      tasa_anterior: 200,
      motivo: "Devaluación confirmada",
      forzado: true,
      fuera_de_rango: true,
    });
  });

  it("una carga normal se audita como no forzada y dentro de rango", async () => {
    const { db, auditoria } = fakeDbConRegistro({ tasa: 800, horasAtras: 1 });
    await setManual(db, { tasa: 807.39, usuarioId: "u-1" });

    expect(auditoria("tasa.setManual")[0]?.payload.metadata).toMatchObject({
      forzado: false,
      fuera_de_rango: false,
    });
  });
});

describe("rechazos por outlier auditados", () => {
  it("un rechazo manual deja fila en audit_log y no escribe tasa", async () => {
    const { db, auditoria, inserts } = fakeDbConRegistro({ tasa: 200, horasAtras: 2 });
    const out = await setManual(db, { tasa: 807.39, usuarioId: "u-1" });

    expect(out.skipped).toBe(true);
    expect(inserts.filter((i) => i.table === "tasa_cambio_bcv")).toHaveLength(0);

    const filas = auditoria("tasa.rechazadaOutlier");
    expect(filas).toHaveLength(1);
    expect(filas[0]?.payload.metadata).toMatchObject({
      fuente: "manual",
      tasa_intentada: 807.39,
      tasa_anterior: 200,
    });
  });

  it("un rechazo del scraper también deja fila", async () => {
    const { db, auditoria, inserts } = fakeDbConRegistro({ tasa: 200, horasAtras: 2 });
    const out = await setFromScraper(db, { tasa: 807.39, ...scrape });

    expect(out.skipped).toBe(true);
    expect(inserts.filter((i) => i.table === "tasa_cambio_bcv")).toHaveLength(0);
    expect(auditoria("tasa.rechazadaOutlier")[0]?.payload.metadata).toMatchObject({
      fuente: "bcv",
      tasa_intentada: 807.39,
      tasa_anterior: 200,
    });
  });

  it("una carga aceptada no genera fila de rechazo", async () => {
    const { db, auditoria } = fakeDbConRegistro({ tasa: 800, horasAtras: 1 });
    await setManual(db, { tasa: 807.39, usuarioId: "u-1" });

    expect(auditoria("tasa.rechazadaOutlier")).toHaveLength(0);
  });
});
