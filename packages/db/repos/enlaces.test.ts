import { describe, expect, it } from "vitest";

import type { Db } from "../sdk";
import {
  ENLACES_PRESUPUESTO_TABLA_FALTANTE,
  crearOReutilizarPresupuesto,
  getPresupuestoBySlug,
  type EnlacePresupuesto,
} from "./enlaces";

/**
 * F7.2.T7 — `crearOReutilizarPresupuesto` / `getPresupuestoBySlug`, con un Db
 * falso que imita la cadena fluida del SDK (mismo patrón que
 * ordenes.entrega.test.ts / config.test.ts). No hay tests de
 * `enlaces_resultado` previos para espejar; se cubre desde cero acá.
 */

type Respuesta = { data?: unknown[]; error?: { code?: string; message: string } | null };
type Llamada = { table: string; op: string; payload?: unknown; filtros: Record<string, unknown> };

function fakeDb(responder: (table: string, op: string) => Respuesta) {
  const llamadas: Llamada[] = [];
  function builder(table: string) {
    const state = {
      op: "select",
      payload: undefined as unknown,
      filtros: {} as Record<string, unknown>,
    };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.eq = (col: string, val: unknown) => {
      state.filtros[col] = val;
      return chain;
    };
    chain.gt = (col: string, val: unknown) => {
      state.filtros[`${col}__gt`] = val;
      return chain;
    };
    chain.insert = (payload?: unknown) => {
      state.op = "insert";
      state.payload = payload;
      return chain;
    };
    chain.then = (resolve: (v: Respuesta) => void, reject: (e: unknown) => void) => {
      llamadas.push({ table, op: state.op, payload: state.payload, filtros: { ...state.filtros } });
      try {
        resolve({ error: null, ...responder(table, state.op) });
      } catch (e) {
        reject(e);
      }
    };
    return chain;
  }
  const db = { from: (table: string) => builder(table) } as unknown as Db;
  return { db, llamadas };
}

const ENLACE: EnlacePresupuesto = {
  id: "enlace-1",
  slug: "aB3xY9kQ2m",
  presupuesto_id: "presupuesto-1",
  expira_en: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
  created_by: "user-1",
};

describe("crearOReutilizarPresupuesto", () => {
  it("reutiliza el enlace vigente en vez de crear uno nuevo", async () => {
    const { db, llamadas } = fakeDb(() => ({ data: [ENLACE] }));

    const resultado = await crearOReutilizarPresupuesto(db, "presupuesto-1", "user-1");

    expect(resultado).toEqual(ENLACE);
    expect(llamadas.some((l) => l.op === "insert")).toBe(false);
  });

  it("crea uno nuevo cuando no hay vigente, con la vigencia pedida", async () => {
    const { db, llamadas } = fakeDb((_table, op) => {
      if (op === "insert") return { data: [ENLACE] };
      return { data: [] }; // sin vigente
    });

    const resultado = await crearOReutilizarPresupuesto(db, "presupuesto-1", "user-1", 7);

    expect(resultado).toEqual(ENLACE);
    const insert = llamadas.find((l) => l.op === "insert");
    expect(insert).toBeDefined();
    const payload = insert!.payload as { presupuesto_id: string; created_by: string; slug: string };
    expect(payload.presupuesto_id).toBe("presupuesto-1");
    expect(payload.created_by).toBe("user-1");
    expect(payload.slug).toHaveLength(10);
  });

  it("traduce la tabla faltante a un código propio", async () => {
    const { db } = fakeDb(() => ({
      error: { code: "42P01", message: 'relation "enlaces_presupuesto" does not exist' },
    }));

    await expect(crearOReutilizarPresupuesto(db, "presupuesto-1", "user-1")).rejects.toThrow(
      ENLACES_PRESUPUESTO_TABLA_FALTANTE,
    );
  });
});

describe("getPresupuestoBySlug", () => {
  it("devuelve el enlace si está vigente", async () => {
    const { db } = fakeDb(() => ({ data: [ENLACE] }));
    expect(await getPresupuestoBySlug(db, ENLACE.slug)).toEqual(ENLACE);
  });

  it("null si no existe", async () => {
    const { db } = fakeDb(() => ({ data: [] }));
    expect(await getPresupuestoBySlug(db, "no-existe")).toBeNull();
  });

  it("null si ya venció, aunque la fila exista", async () => {
    const vencido = { ...ENLACE, expira_en: new Date(Date.now() - 1000).toISOString() };
    const { db } = fakeDb(() => ({ data: [vencido] }));
    expect(await getPresupuestoBySlug(db, vencido.slug)).toBeNull();
  });
});
