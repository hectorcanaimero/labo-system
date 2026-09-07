import { describe, expect, it } from "vitest";

import type { Db } from "../sdk";
import { updateEstado } from "./ordenes";

/**
 * `crearVerificacionBestEffort` (F7.3.T5): antes tragaba CUALQUIER error al
 * crear el enlace de verificación con un `console.warn` — un error real (no
 * la migración 0016 faltante) se perdía sin dejar rastro. Ahora solo
 * `VERIFICACION_TABLA_FALTANTE` se traga en silencio; el resto queda en
 * `audit_log`, sin tumbar la entrega de la orden.
 *
 * Mismo `fakeDb` que `ordenes.entrega.test.ts` (cadena fluida del SDK,
 * responde por tabla).
 */

type Respuesta = { data?: unknown[]; error?: { message: string; code?: string } | null };
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

describe("updateEstado → Entregada — error al crear el enlace de verificación", () => {
  it("un error real no rompe la entrega y queda en audit_log", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "ordenes") return { data: [ORDEN] };
      if (table === "ordenes_examenes") return { data: [linea("a", "5.4")] };
      if (table === "enlaces_verificacion") {
        return { error: { message: "conexión perdida", code: "58000" } };
      }
      return {};
    });

    await expect(updateEstado(db, ORDEN.id, "Entregada", "u1")).resolves.toBeTruthy();

    const errorAuditado = llamadas.find(
      (l) =>
        l.table === "audit_log" &&
        l.op === "insert" &&
        (l.payload as { accion?: string })?.accion === "ordenes.verificacion_error",
    );
    expect(errorAuditado).toBeTruthy();
    expect(
      (errorAuditado?.payload as { metadata?: { message?: string } })?.metadata?.message,
    ).toContain("conexión perdida");
  });

  it("VERIFICACION_TABLA_FALTANTE se traga en silencio, sin auditoría", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "ordenes") return { data: [ORDEN] };
      if (table === "ordenes_examenes") return { data: [linea("a", "5.4")] };
      if (table === "enlaces_verificacion") {
        return {
          error: { message: 'relation "enlaces_verificacion" does not exist', code: "42P01" },
        };
      }
      return {};
    });

    await expect(updateEstado(db, ORDEN.id, "Entregada", "u1")).resolves.toBeTruthy();

    const errorAuditado = llamadas.find(
      (l) =>
        l.table === "audit_log" &&
        (l.payload as { accion?: string })?.accion === "ordenes.verificacion_error",
    );
    expect(errorAuditado).toBeUndefined();
  });
});
