import { describe, expect, it } from "vitest";

import type { Db } from "../sdk";
import { getExamenes } from "./paquetes";

/** Db falsa: responde por tabla y por la columna del `.in(...)`, si hay. */
function fakeDb(responder: (table: string, inCol: string | null) => unknown[]) {
  function builder(table: string) {
    let inCol: string | null = null;
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit", "order"]) chain[m] = () => chain;
    chain.in = (col: string) => {
      inCol = col;
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data: responder(table, inCol), error: null });
    return chain;
  }
  return { from: builder } as unknown as Db;
}

const ex = (id: string, titulo_id: string, nombre: string) => ({
  id,
  titulo_id,
  nombre,
  precio_usd: "2",
  unidad: null,
  valores_referencia: null,
  activo: true,
});

describe("getExamenes", () => {
  it("expande los grupos en su orden, marca el grupo y deja los sueltos al final", async () => {
    const db = fakeDb((table, inCol) => {
      if (table === "paquetes") return [{ id: "p1" }];
      if (table === "paquetes_titulos") return [{ titulo_id: "t2", orden: 1 }, { titulo_id: "t1", orden: 2 }];
      if (table === "examenes_titulos") return [{ id: "t1", nombre: "T1" }, { id: "t2", nombre: "T2" }];
      if (table === "paquetes_examenes") return [{ examen_id: "s1", orden: 1 }, { examen_id: "a", orden: 2 }];
      if (table === "examenes" && inCol === "id") return [ex("s1", "t9", "Suelto"), ex("a", "t1", "A")];
      // `examenes` por titulo_id: ya viene en el orden del grupo (orden, nombre).
      if (table === "examenes") return [ex("b", "t1", "B"), ex("a", "t1", "A"), ex("c", "t2", "C")];
      return [];
    });

    const out = await getExamenes(db, "p1");
    expect(out.map((e) => [e.id, e.grupo, e.orden])).toEqual([
      ["c", "T2", 1],
      ["b", "T1", 2],
      ["a", "T1", 3],
      ["s1", null, 4],
    ]);
    expect(out[0]!.precio_usd).toBe(2);
  });
});
