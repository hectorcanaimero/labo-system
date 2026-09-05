import { describe, expect, it } from "vitest";

import type { Db } from "../sdk";
import {
  ENTREGA_REQUIERE_VALORES,
  ESTADO_FECHA_INCOHERENTE,
  ESTADO_REQUIERE_FECHA_RESULTADO,
  create,
  update,
  updateEstado,
} from "./ordenes";

/**
 * Regla "no se entrega con valores en blanco", probada contra un Db falso
 * que imita la cadena fluida del SDK (`from().select().eq()...`) y responde
 * por tabla. Alcanza para verificar que el repo corta ANTES de escribir.
 */

type Respuesta = { data?: unknown[]; error?: { message: string } | null };
type Llamada = { table: string; op: string; payload?: unknown };

function fakeDb(responder: (table: string, op: string) => Respuesta) {
  const llamadas: Llamada[] = [];
  function builder(table: string) {
    const state = { op: "select", payload: undefined as unknown };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit", "order", "in", "maybeSingle"]) {
      chain[m] = () => chain;
    }
    for (const m of ["insert", "update", "delete", "upsert"]) {
      chain[m] = (payload?: unknown) => {
        state.op = m;
        state.payload = payload;
        return chain;
      };
    }
    chain.then = (resolve: (v: Respuesta) => void, reject: (e: unknown) => void) => {
      llamadas.push({ table, op: state.op, payload: state.payload });
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

const ORDEN = {
  id: "11111111-1111-4111-8111-111111111111",
  paciente_id: "22222222-2222-4222-8222-222222222222",
  fecha_muestra: "2026-08-31T12:00:00.000Z",
  fecha_resultado: null,
  medico_solicitante: null,
  estado: "Validando",
  observaciones: null,
  origen_presupuesto_id: null,
  created_at: "2026-08-31T12:00:00.000Z",
  created_by: "u1",
};

const linea = (id: string, valor: string) => ({
  id,
  examen_id: `ex-${id}`,
  nombre_snap: `Examen ${id}`,
  precio_snap: "1",
  unidad_snap: null,
  valores_referencia_snap: null,
  tipo_analisis_snap: null,
  metodo_snap: null,
  valor,
  observacion: null,
  orden: 1,
});

describe("updateEstado → Entregada", () => {
  it("rechaza si alguna línea está sin valor y no escribe nada", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "ordenes") return { data: [ORDEN] };
      if (table === "ordenes_examenes") return { data: [linea("a", "5.4"), linea("b", "")] };
      return {};
    });
    await expect(updateEstado(db, ORDEN.id, "Entregada", "u1")).rejects.toThrow(
      ENTREGA_REQUIERE_VALORES,
    );
    expect(llamadas.filter((l) => l.op === "update")).toHaveLength(0);
  });

  it("acepta con todas las líneas cargadas y fija la fecha de resultado", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "ordenes") return { data: [ORDEN] };
      if (table === "ordenes_examenes") return { data: [linea("a", "5.4"), linea("b", "Negativo")] };
      return {};
    });
    await expect(updateEstado(db, ORDEN.id, "Entregada", "u1")).resolves.toBeTruthy();
    const upd = llamadas.find((l) => l.table === "ordenes" && l.op === "update");
    expect(upd?.payload).toMatchObject({ estado: "Entregada" });
    expect((upd?.payload as { fecha_resultado?: string }).fecha_resultado).toBeTruthy();
  });

  it("otras transiciones no exigen valores", async () => {
    const { db } = fakeDb((table) => {
      if (table === "ordenes") return { data: [{ ...ORDEN, estado: "Registrada" }] };
      if (table === "ordenes_examenes") return { data: [linea("a", "")] };
      return {};
    });
    await expect(updateEstado(db, ORDEN.id, "Muestra tomada", "u1")).resolves.toBeTruthy();
  });
});

describe("update con fecha de resultado (pasa a Entregada)", () => {
  it("rechaza si las líneas que quedan tienen valores vacíos", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "ordenes") return { data: [ORDEN] };
      if (table === "ordenes_examenes") return { data: [linea("a", "5.4")] };
      return {};
    });
    await expect(
      update(
        db,
        ORDEN.id,
        {
          fecha_resultado: "2026-09-01T12:00:00.000Z",
          examenes: [{ examen_id: "ex-a", valor: "5.4" }, { examen_id: "ex-b", valor: " " }],
        },
        "u1",
      ),
    ).rejects.toThrow(ENTREGA_REQUIERE_VALORES);
    expect(llamadas.filter((l) => l.op !== "select")).toHaveLength(0);
  });

  it("rechaza si no mandan líneas y las guardadas están vacías", async () => {
    const { db } = fakeDb((table) => {
      if (table === "ordenes") return { data: [ORDEN] };
      if (table === "ordenes_examenes") return { data: [linea("a", "")] };
      return {};
    });
    await expect(
      update(db, ORDEN.id, { fecha_resultado: "2026-09-01T12:00:00.000Z" }, "u1"),
    ).rejects.toThrow(ENTREGA_REQUIERE_VALORES);
  });

  it("sin fecha de resultado se puede guardar con valores pendientes", async () => {
    const { db } = fakeDb((table) => {
      if (table === "ordenes") return { data: [{ ...ORDEN, estado: "En proceso" }] };
      if (table === "ordenes_examenes") return { data: [linea("a", "")] };
      return {};
    });
    await expect(update(db, ORDEN.id, { medico_solicitante: "Dra. López" }, "u1")).resolves.toBeTruthy();
  });
});

describe("create con fecha de resultado (nace Entregada)", () => {
  it("rechaza valores vacíos antes de insertar", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "pacientes") return { data: [{ id: ORDEN.paciente_id }] };
      return {};
    });
    await expect(
      create(
        db,
        {
          paciente_id: ORDEN.paciente_id,
          fecha_muestra: "2026-08-31T12:00:00.000Z",
          fecha_resultado: "2026-09-01T12:00:00.000Z",
          examenes: [{ examen_id: "ex-a", valor: "" }],
        },
        "u1",
      ),
    ).rejects.toThrow(ENTREGA_REQUIERE_VALORES);
    expect(llamadas.filter((l) => l.op === "insert")).toHaveLength(0);
  });

  it("con estado explícito Entregada exige fecha de resultado", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "pacientes") return { data: [{ id: ORDEN.paciente_id }] };
      return {};
    });
    await expect(
      create(
        db,
        {
          paciente_id: ORDEN.paciente_id,
          fecha_muestra: "2026-08-31T12:00:00.000Z",
          estado: "Entregada",
          examenes: [{ examen_id: "ex-a", valor: "5.4" }],
        },
        "u1",
      ),
    ).rejects.toThrow(ESTADO_REQUIERE_FECHA_RESULTADO);
    expect(llamadas.filter((l) => l.op === "insert")).toHaveLength(0);
  });

  it("con estado explícito Registrada no admite fecha de resultado", async () => {
    const { db } = fakeDb((table) => {
      if (table === "pacientes") return { data: [{ id: ORDEN.paciente_id }] };
      return {};
    });
    await expect(
      create(
        db,
        {
          paciente_id: ORDEN.paciente_id,
          fecha_muestra: "2026-08-31T12:00:00.000Z",
          fecha_resultado: "2026-09-01T12:00:00.000Z",
          estado: "Registrada",
          examenes: [{ examen_id: "ex-a", valor: "5.4" }],
        },
        "u1",
      ),
    ).rejects.toThrow(ESTADO_FECHA_INCOHERENTE);
  });

  it("un estado intermedio explícito permite valores pendientes y llega al insert", async () => {
    const { db, llamadas } = fakeDb((table, op) => {
      if (table === "pacientes") return { data: [{ id: ORDEN.paciente_id }] };
      if (table === "ordenes" && op === "insert") return { data: [{ ...ORDEN, estado: "En proceso" }] };
      if (table === "examenes") return { data: [{ id: "ex-a", nombre: "A", precio_usd: 1, unidad: null, valores_referencia: null, tipo_analisis: null, metodo: null }] };
      if (table === "ordenes_examenes") return { data: [linea("a", "")] };
      return {};
    });
    await expect(
      create(
        db,
        {
          paciente_id: ORDEN.paciente_id,
          fecha_muestra: "2026-08-31T12:00:00.000Z",
          estado: "En proceso",
          examenes: [{ examen_id: "ex-a", valor: "" }],
        },
        "u1",
      ),
    ).resolves.toBeTruthy();
    const ins = llamadas.find((l) => l.table === "ordenes" && l.op === "insert");
    expect(ins?.payload).toMatchObject({ estado: "En proceso", fecha_resultado: null });
  });
});
