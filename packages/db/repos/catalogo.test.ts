import { describe, expect, it } from "vitest";

import type { Db } from "../sdk";
import { crearRepoCatalogo, type ItemCatalogo } from "./catalogo";

/**
 * Reglas compartidas por los catálogos de métodos (0017) y tipos (0019).
 * Antes `metodos.ts` no tenía tests; al unificar la implementación, esta
 * batería cubre los dos.
 */

const CODIGOS = {
  duplicado: "X_DUPLICADO",
  noEncontrado: "X_NO_ENCONTRADO",
  tablaFaltante: "X_TABLA_FALTANTE",
};

type Respuesta = { data?: unknown[]; error?: unknown };
type Llamada = { table: string; op: string; payload?: unknown; filtros: Record<string, unknown> };

/** Db falsa que imita la cadena fluida del SDK y registra cada operación. */
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
    for (const m of ["insert", "update", "delete"]) {
      chain[m] = (payload?: unknown) => {
        state.op = m;
        state.payload = payload;
        return chain;
      };
    }
    chain.then = (resolve: (v: Respuesta) => void) => {
      llamadas.push({ table, op: state.op, payload: state.payload, filtros: { ...state.filtros } });
      const r = responder(table, state.op);
      resolve({ error: null, ...r });
    };
    return chain;
  }

  return { db: { from: builder } as unknown as Db, llamadas };
}

const item = (over: Partial<ItemCatalogo> = {}): ItemCatalogo => ({
  id: "id-1",
  nombre: "ELISA",
  activo: true,
  orden: 1,
  created_at: "2026-09-07T00:00:00.000Z",
  ...over,
});

const repo = crearRepoCatalogo("tabla_x", "tabla_x_nombre_unique", CODIGOS);

describe("list", () => {
  it("filtra por activo salvo que se pidan los inactivos", async () => {
    const { db, llamadas } = fakeDb(() => ({ data: [item()] }));

    await repo.list(db);
    expect(llamadas.at(-1)?.filtros).toEqual({ activo: true });

    await repo.list(db, { incluirInactivos: true });
    expect(llamadas.at(-1)?.filtros).toEqual({});
  });

  it("traduce la tabla ausente a su código propio, no a un 500 opaco", async () => {
    const { db } = fakeDb(() => ({ error: { code: "PGRST205", message: "no schema cache" } }));
    await expect(repo.list(db)).rejects.toThrow(CODIGOS.tablaFaltante);
  });
});

describe("create", () => {
  it("recorta el nombre y lo agrega al final", async () => {
    const { db, llamadas } = fakeDb((_t, op) =>
      op === "insert" ? { data: [item()] } : { data: [{ orden: 7 }] },
    );

    await repo.create(db, { nombre: "  ELISA  ", usuarioId: "u1" });

    const ins = llamadas.find((l) => l.op === "insert" && l.table === "tabla_x");
    expect(ins?.payload).toEqual({ nombre: "ELISA", orden: 8 });
  });

  it("con la tabla vacía arranca en orden 1", async () => {
    const { db, llamadas } = fakeDb((_t, op) => (op === "insert" ? { data: [item()] } : { data: [] }));
    await repo.create(db, { nombre: "PCR", usuarioId: "u1" });
    expect((llamadas.find((l) => l.op === "insert")?.payload as { orden: number }).orden).toBe(1);
  });

  it.each(["", "   ", 42, null, undefined, "x".repeat(121)])(
    "rechaza un nombre inválido: %p",
    async (nombre) => {
      const { db } = fakeDb(() => ({ data: [] }));
      await expect(repo.create(db, { nombre, usuarioId: "u1" })).rejects.toThrow(
        "VALIDACION_FALLIDA",
      );
    },
  );

  it("traduce el UNIQUE del nombre a su código de dominio", async () => {
    const { db } = fakeDb((_t, op) =>
      op === "insert"
        ? { error: { code: "23505", message: 'duplicate key "tabla_x_nombre_unique"' } }
        : { data: [{ orden: 1 }] },
    );
    await expect(repo.create(db, { nombre: "ELISA", usuarioId: "u1" })).rejects.toThrow(
      CODIGOS.duplicado,
    );
  });

  it("otro 23505 que no sea el del nombre no se confunde con duplicado", async () => {
    const { db } = fakeDb((_t, op) =>
      op === "insert"
        ? { error: { code: "23505", message: 'duplicate key "otro_constraint"' } }
        : { data: [{ orden: 1 }] },
    );
    await expect(repo.create(db, { nombre: "ELISA", usuarioId: "u1" })).rejects.toThrow(
      /tabla_x\.create/,
    );
  });

  it("deja rastro en audit_log", async () => {
    const { db, llamadas } = fakeDb((_t, op) =>
      op === "insert" ? { data: [item()] } : { data: [{ orden: 1 }] },
    );
    await repo.create(db, { nombre: "ELISA", usuarioId: "u1" });

    const audit = llamadas.find((l) => l.table === "audit_log");
    expect(audit?.payload).toMatchObject({
      accion: "tabla_x.create",
      entity_type: "tabla_x",
      usuario_id: "u1",
    });
  });
});

describe("update", () => {
  it("renombra sin tocar `activo`", async () => {
    const { db, llamadas } = fakeDb(() => ({ data: [item()] }));
    await repo.update(db, { id: "id-1", nombre: "ELISA v2", usuarioId: "u1" });

    const upd = llamadas.find((l) => l.op === "update" && l.table === "tabla_x");
    expect(upd?.payload).toEqual({ nombre: "ELISA v2" });
  });

  it("desactiva sin tocar el nombre", async () => {
    const { db, llamadas } = fakeDb(() => ({ data: [item()] }));
    await repo.update(db, { id: "id-1", activo: false, usuarioId: "u1" });

    const upd = llamadas.find((l) => l.op === "update" && l.table === "tabla_x");
    expect(upd?.payload).toEqual({ activo: false });
  });

  it("sin cambios devuelve el anterior y no escribe", async () => {
    const { db, llamadas } = fakeDb(() => ({ data: [item()] }));
    const out = await repo.update(db, { id: "id-1", usuarioId: "u1" });

    expect(out).toEqual(item());
    expect(llamadas.filter((l) => l.op === "update")).toHaveLength(0);
  });

  it("id inexistente da NO_ENCONTRADO", async () => {
    const { db } = fakeDb(() => ({ data: [] }));
    await expect(repo.update(db, { id: "id-9", nombre: "X", usuarioId: "u1" })).rejects.toThrow(
      CODIGOS.noEncontrado,
    );
  });

  it.each([null, 42, "", "  "])("id inválido: %p", async (id) => {
    const { db } = fakeDb(() => ({ data: [item()] }));
    await expect(repo.update(db, { id, nombre: "X", usuarioId: "u1" })).rejects.toThrow(
      "VALIDACION_FALLIDA",
    );
  });

  it("`activo` no booleano se rechaza", async () => {
    const { db } = fakeDb(() => ({ data: [item()] }));
    await expect(
      repo.update(db, { id: "id-1", activo: "false", usuarioId: "u1" }),
    ).rejects.toThrow("VALIDACION_FALLIDA");
  });

  it("audita el valor anterior y el nuevo", async () => {
    const { db, llamadas } = fakeDb(() => ({ data: [item()] }));
    await repo.update(db, { id: "id-1", nombre: "ELISA v2", usuarioId: "u1" });

    expect(llamadas.find((l) => l.table === "audit_log")?.payload).toMatchObject({
      accion: "tabla_x.update",
      metadata: { anterior: { nombre: "ELISA", activo: true }, nuevo: { nombre: "ELISA v2" } },
    });
  });
});
