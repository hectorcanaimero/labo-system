import { describe, expect, it } from "vitest";

import type { Db } from "../sdk";
import { get, update, updateAssetKey, type LaboratorioConfig } from "./config";

/**
 * F7.6.T2 — el usuario reportó que el logo/firma/sello subidos en
 * Configuración "se pierden". Candidato investigado: que guardar el
 * formulario principal (`update`, PUT /api/config) pisara las columnas de
 * asset porque no las incluye en su payload.
 *
 * No es lo que pasa: `.upsert(payload, { onConflict })` de PostgREST sólo
 * toca, en el `ON CONFLICT DO UPDATE SET`, las columnas presentes en el
 * payload — las que faltan quedan intocadas. Esta batería fija ese
 * contrato con un Db falso que imita la cadena fluida del SDK (mismo
 * patrón que ordenes.entrega.test.ts), para que un cambio futuro que
 * empiece a mandar `logo_object_key`/etc. en `update()` (con lo que sí
 * los pisaría) rompa un test en vez de perder un archivo en producción.
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

const CONFIG_ACTUAL: LaboratorioConfig = {
  id: "id-config",
  nombre: "Laboratorio Actual",
  direccion: "Av. Siempre Viva 123",
  telefono: "0212-555-0000",
  email: "contacto@labo.com",
  rif: "J-12345678-9",
  colegio_bioanalistas: "713",
  mpps: "10738",
  logo_object_key: "assets/logo/existing-logo.png",
  firma_object_key: "assets/firma/existing-firma.png",
  sello_object_key: null,
  pdf_pie_pagina: "Pie de página",
  toma_muestra_default_usd: 5,
  ganancia_default_pct: 15,
  updated_at: "2026-09-01T00:00:00.000Z",
  updated_by: "user-1",
};

describe("config.update", () => {
  it("nunca incluye las columnas de asset en el payload del upsert", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "laboratorio_config") return { data: [CONFIG_ACTUAL] };
      return { data: [] };
    });

    await update(db, { nombre: "Laboratorio Nuevo Nombre" }, "user-1");

    const upserts = llamadas.filter(
      (l) => l.table === "laboratorio_config" && l.op === "upsert",
    );
    expect(upserts).toHaveLength(1);
    const payload = upserts[0]!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("logo_object_key");
    expect(payload).not.toHaveProperty("firma_object_key");
    expect(payload).not.toHaveProperty("sello_object_key");
    // Confirma que sí llevó lo que el form manda.
    expect(payload.nombre).toBe("Laboratorio Nuevo Nombre");
  });
});

describe("config.updateAssetKey", () => {
  it("sólo cambia la key del tipo pedido y preserva los otros dos assets", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "laboratorio_config") return { data: [CONFIG_ACTUAL] };
      return { data: [] };
    });

    await updateAssetKey(db, "sello", "assets/sello/new-sello.png", "user-1");

    const upserts = llamadas.filter(
      (l) => l.table === "laboratorio_config" && l.op === "upsert",
    );
    expect(upserts).toHaveLength(1);
    const payload = upserts[0]!.payload as Record<string, unknown>;
    expect(payload.logo_object_key).toBe(CONFIG_ACTUAL.logo_object_key);
    expect(payload.firma_object_key).toBe(CONFIG_ACTUAL.firma_object_key);
    expect(payload.sello_object_key).toBe("assets/sello/new-sello.png");
    // Y preserva el resto de la config, no sólo los tres asset keys.
    expect(payload.nombre).toBe(CONFIG_ACTUAL.nombre);
    expect(payload.direccion).toBe(CONFIG_ACTUAL.direccion);
  });

  it("no pisa un asset con null al tocar uno distinto", async () => {
    const { db } = fakeDb((table) => {
      if (table === "laboratorio_config") return { data: [CONFIG_ACTUAL] };
      return { data: [] };
    });

    const result = await updateAssetKey(db, "logo", "assets/logo/replaced.png", "user-1");
    expect(result.firma_object_key).toBe(CONFIG_ACTUAL.firma_object_key);
    expect(result.sello_object_key).toBeNull();
  });
});

describe("config.get", () => {
  it("normaliza toma_muestra_default_usd cuando PostgREST lo devuelve como string", async () => {
    const { db } = fakeDb((table) => {
      if (table === "laboratorio_config") {
        return { data: [{ ...CONFIG_ACTUAL, toma_muestra_default_usd: "5.00" }] };
      }
      return { data: [] };
    });

    const config = await get(db);
    expect(config?.toma_muestra_default_usd).toBe(5);
  });
});
