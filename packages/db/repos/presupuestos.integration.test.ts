import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeSql } from "../client";
import {
  cambiarEstado,
  create as crearPresupuestoRepo,
  convertToOrden,
  list as listPresupuestos,
  PACIENTE_FICHA_INCOMPLETA,
  TRANSICION_ESTADO_INVALIDA,
} from "./presupuestos";
import { CONTACTO_REQUERIDO } from "@labo/lib/schemas/paciente";
import type { Db } from "../sdk";

// `cambiarEstado`/`list` migraron a recibir el cliente InsForge (`Db`,
// PostgREST) inyectado en vez de usar `getSql()` internamente. Este fixture
// solo levanta Postgres directo (sin InsForge delante), así que no hay forma
// de construir un `Db` real acá: los tests que dependen de esas funciones se
// saltan más abajo con `it.skip` y motivo. El stub solo satisface el tipo.
const db = undefined as unknown as Db;

/**
 * Test de integración contra Postgres real (contenedor efímero).
 *
 * Requiere `TEST_DATABASE_URL` apuntando a una base **dedicada/efímera**: el
 * `beforeAll` hace `DROP SCHEMA public CASCADE` y reaplica `schema.sql`.
 *
 * Ejecución:
 *   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/labo_test \
 *     pnpm --filter @labo/db test
 *
 * Sin `TEST_DATABASE_URL`, el suite se salta (CI provisiona el contenedor).
 *
 * Verifica que los CHECKs declarativos del DDL actúan como "última red" del
 * backend (ADR-11), independientemente de la validación Zod en la UI:
 *   - `descuento_pct BETWEEN 0 AND 100`
 *   - `ganancia_pct >= 0`
 *   - `tasa_bs > 0`
 *   - `presupuestos_paciente_xor` (XOR paciente_id vs nombre_libre)
 *
 * Además cubre la máquina de estados del pipeline comercial (F6.2.T2):
 * transiciones permitidas, motivo de rechazo y auditoría.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("presupuestos — integración Postgres (DDL CHECKs + máquina de estados)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL as string, { max: 1 });
    const schema = readFileSync(
      fileURLToPath(new URL("../schema.sql", import.meta.url)),
      "utf8",
    );
    await sql
      .unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
      .simple();
    await sql.unsafe(schema).simple();
    // El repo usa `getSql()`, que lee DATABASE_URL; lo apuntamos a la base
    // efímera para ejercitar las funciones reales del repositorio.
    process.env.DATABASE_URL = TEST_DB_URL;
  });

  afterAll(async () => {
    await closeSql();
    await sql?.end();
  });

  async function crearPaciente(): Promise<string> {
    const cedula = `V-${Math.floor(10000000 + Math.random() * 89999999)}`;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO pacientes (nombre, apellido, cedula, fecha_nacimiento, sexo)
      VALUES (${"Juan"}, ${"Pérez"}, ${cedula}, ${new Date("1990-01-01T00:00:00.000Z")}, ${"M"})
      RETURNING id
    `;
    return rows[0].id;
  }

  async function crearUsuario(role: "admin" | "operador" = "operador"): Promise<string> {
    const email = `u-${randomUUID()}@labsystem.dev`;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO usuarios (email, nombre, role)
      VALUES (${email}, ${"Usuario Test"}, ${role})
      RETURNING id
    `;
    return rows[0].id;
  }

  function presupuestoBase(
    pacienteId: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      paciente_id: pacienteId,
      paciente_nombre_libre: null,
      tasa_bs: 36.5,
      created_by: randomUUID(),
      ...overrides,
    };
  }

  async function expectCheckViolation(
    fn: () => Promise<unknown>,
    constraint: string,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      const e = err as { code?: string; constraint?: string; message?: string };
      expect(e.code).toBe("23514");
      expect(`${e.constraint ?? ""} ${e.message ?? ""}`).toContain(constraint);
      return;
    }
    throw new Error(
      `Se esperaba violación del CHECK ${constraint}, pero el insert fue aceptado`,
    );
  }

  async function crearPresupuesto(
    pacienteId: string,
    estado = "Borrador",
    motivoRechazo?: string,
  ): Promise<string> {
    const overrides: Record<string, unknown> = { estado };
    if (estado === "Rechazado") {
      overrides.motivo_rechazo = motivoRechazo;
    }
    const rows = await sql<{ id: string }[]>`
      INSERT INTO presupuestos ${sql(presupuestoBase(pacienteId, overrides))}
      RETURNING id
    `;
    return rows[0].id;
  }

  async function expectError(fn: () => Promise<unknown>, code: string): Promise<void> {
    await expect(fn()).rejects.toThrow(code);
  }

  it("rechaza descuento 150% (CHECK descuento_pct)", async () => {
    const pacienteId = await crearPaciente();
    await expectCheckViolation(
      () =>
        sql`INSERT INTO presupuestos ${sql(
          presupuestoBase(pacienteId, { descuento_pct: 150 }),
        )}`,
      "presupuestos_descuento_pct_check",
    );
  });

  it("rechaza ganancia negativa (CHECK ganancia_pct)", async () => {
    const pacienteId = await crearPaciente();
    await expectCheckViolation(
      () =>
        sql`INSERT INTO presupuestos ${sql(
          presupuestoBase(pacienteId, { ganancia_pct: -5 }),
        )}`,
      "presupuestos_ganancia_pct_check",
    );
  });

  it("rechaza tasa 0 (CHECK tasa_bs)", async () => {
    const pacienteId = await crearPaciente();
    await expectCheckViolation(
      () =>
        sql`INSERT INTO presupuestos ${sql(
          presupuestoBase(pacienteId, { tasa_bs: 0 }),
        )}`,
      "presupuestos_tasa_bs_check",
    );
  });

  it("rechaza paciente_id + nombre_libre (CHECK presupuestos_paciente_xor)", async () => {
    const pacienteId = await crearPaciente();
    await expectCheckViolation(
      () =>
        sql`INSERT INTO presupuestos ${sql(
          presupuestoBase(pacienteId, { paciente_nombre_libre: "Walk-in" }),
        )}`,
      "presupuestos_paciente_xor",
    );
  });

  it("rechaza presupuesto sin paciente ni nombre_libre (CHECK presupuestos_paciente_xor)", async () => {
    await expectCheckViolation(
      () =>
        sql`INSERT INTO presupuestos ${sql(
          presupuestoBase(null as unknown as string, {
            paciente_id: null,
          }),
        )}`,
      "presupuestos_paciente_xor",
    );
  });

  it("acepta presupuesto válido con paciente_id", async () => {
    const pacienteId = await crearPaciente();
    const rows = await sql<{ id: string }[]>`
      INSERT INTO presupuestos ${sql(presupuestoBase(pacienteId))}
      RETURNING id
    `;
    expect(rows[0].id).toBeTruthy();
  });

  it.skip("cambiarEstado ejecuta transiciones válidas Borrador → Enviado → Aprobado (requiere Db InsForge real)", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Borrador");

    const enviado = await cambiarEstado(db, id, "Enviado", undefined, usuarioId);
    expect(enviado.estado).toBe("Enviado");

    const aprobado = await cambiarEstado(db, id, "Aprobado", undefined, usuarioId);
    expect(aprobado.estado).toBe("Aprobado");
  });

  it.skip("cambiarEstado rechaza transición no permitida con TRANSICION_ESTADO_INVALIDA (requiere Db InsForge real)", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Borrador");

    await expectError(
      () => cambiarEstado(db, id, "Aprobado", undefined, usuarioId),
      TRANSICION_ESTADO_INVALIDA,
    );
  });

  it.skip("cambiarEstado a Rechazado persiste motivo_rechazo y lo limpia al volver a Borrador (requiere Db InsForge real)", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Enviado");

    await cambiarEstado(db, id, "Rechazado", "Precio fuera de presupuesto", usuarioId);

    const rechazado = await sql<{ estado: string; motivo_rechazo: string | null }[]>`
      SELECT estado, motivo_rechazo FROM presupuestos WHERE id = ${id}
    `;
    expect(rechazado[0].estado).toBe("Rechazado");
    expect(rechazado[0].motivo_rechazo).toBe("Precio fuera de presupuesto");

    await cambiarEstado(db, id, "Borrador", undefined, usuarioId);

    const borrador = await sql<{ estado: string; motivo_rechazo: string | null }[]>`
      SELECT estado, motivo_rechazo FROM presupuestos WHERE id = ${id}
    `;
    expect(borrador[0].estado).toBe("Borrador");
    expect(borrador[0].motivo_rechazo).toBeNull();
  });

  it.skip("cambiarEstado a Rechazado sin motivo lanza MOTIVO_RECHAZO_REQUERIDO (requiere Db InsForge real)", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Enviado");

    await expectError(
      () => cambiarEstado(db, id, "Rechazado", undefined, usuarioId),
      "MOTIVO_RECHAZO_REQUERIDO",
    );
  });

  it.skip("cambiarEstado registra audit_log con metadata de la transición (requiere Db InsForge real)", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Borrador");

    await cambiarEstado(db, id, "Enviado", undefined, usuarioId);

    const audit = await sql<
      {
        accion: string;
        entity_type: string;
        entity_id: string | null;
        usuario_id: string | null;
        metadata: { estado_anterior: string; estado: string; motivo_rechazo: string | null };
      }[]
    >`
      SELECT accion, entity_type, entity_id, usuario_id, metadata
      FROM audit_log
      WHERE entity_id = ${id} AND accion = 'presupuestos.update_estado'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0].accion).toBe("presupuestos.update_estado");
    expect(audit[0].entity_type).toBe("presupuestos");
    expect(audit[0].entity_id).toBe(id);
    expect(audit[0].usuario_id).toBe(usuarioId);
    expect(audit[0].metadata.estado_anterior).toBe("Borrador");
    expect(audit[0].metadata.estado).toBe("Enviado");
  });

  it.skip("list filtra por array de estados (requiere Db InsForge real)", async () => {
    const pacienteId = await crearPaciente();
    await crearPresupuesto(pacienteId, "Borrador");
    await crearPresupuesto(pacienteId, "Enviado");
    await crearPresupuesto(pacienteId, "Aprobado");

    const dosEstados = await listPresupuestos(db, {
      filters: { paciente_id: pacienteId, estados: ["Borrador", "Enviado"] },
    });
    expect(dosEstados.total).toBe(2);
    expect(dosEstados.items.map((item) => item.estado).sort()).toEqual([
      "Borrador",
      "Enviado",
    ]);

    const uno = await listPresupuestos(db, {
      filters: { paciente_id: pacienteId, estados: ["Aprobado"] },
    });
    expect(uno.total).toBe(1);
    expect(uno.items[0].estado).toBe("Aprobado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F8.2.T1 — ficha incompleta de paciente (paciente_provisional)
//
// Sin `Db` InsForge real disponible en este fixture (ver nota arriba), estos
// casos se prueban contra un Db falso que imita la cadena fluida del SDK
// (mismo patrón que `ordenes.entrega.test.ts`), alcanza para verificar que el
// repo arma bien las escrituras y corta ANTES de crear la orden con la ficha
// incompleta.
// ─────────────────────────────────────────────────────────────────────────────

type FakeRespuesta = { data?: unknown; error?: { message: string } | null };
type FakeLlamada = { table: string; op: string; payload?: unknown };

function fakeDb(responder: (table: string, op: string) => FakeRespuesta) {
  const llamadas: FakeLlamada[] = [];
  function builder(table: string) {
    const state = { op: "select", payload: undefined as unknown };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit", "order", "in", "maybeSingle", "single"]) {
      chain[m] = () => chain;
    }
    for (const m of ["insert", "update", "delete", "upsert"]) {
      chain[m] = (payload?: unknown) => {
        state.op = m;
        state.payload = payload;
        return chain;
      };
    }
    chain.then = (resolve: (v: FakeRespuesta) => void, reject: (e: unknown) => void) => {
      llamadas.push({ table, op: state.op, payload: state.payload });
      try {
        resolve({ error: null, ...responder(table, state.op) });
      } catch (e) {
        reject(e);
      }
    };
    return chain;
  }
  const fake = { from: (table: string) => builder(table) } as unknown as Db;
  return { db: fake, llamadas };
}

const EXAMEN = { id: "ex-1", nombre: "Hemograma", precio_usd: 10 };
const FICHA_PROVISIONAL = {
  id: "pac-provisional-1",
  nombre: "Juan",
  apellido: "Pérez",
  cedula: null,
  fecha_nacimiento: null,
  sexo: null,
  telefono: "0414-1234567",
  email: null,
  direccion: null,
  ubicacion_url: null,
  activo: true,
  created_at: "2026-09-16T00:00:00.000Z",
  updated_at: "2026-09-16T00:00:00.000Z",
};

function presupuestoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pres-1",
    numero_correlativo: 1,
    paciente_id: FICHA_PROVISIONAL.id,
    paciente_nombre_libre: null,
    descuento_pct: 0,
    ganancia_pct: 30,
    tasa_bs: 36.5,
    toma_muestra_usd: 0,
    domicilio_usd: 0,
    total_usd: 13,
    total_bs: 474.5,
    estado: "Borrador",
    orden_id: null,
    created_at: "2026-09-16T00:00:00.000Z",
    created_by: "u1",
    pacientes: { nombre: FICHA_PROVISIONAL.nombre, apellido: FICHA_PROVISIONAL.apellido },
    ...overrides,
  };
}

const CREATE_INPUT_PROVISIONAL = {
  paciente_provisional: { nombre: "Juan", apellido: "Pérez", telefono: "0414-1234567" },
  descuento_pct: 0,
  ganancia_pct: 30,
  tasa_bs: 36.5,
  examenes: [{ examen_id: EXAMEN.id }],
};

describe("presupuestos.create — paciente_provisional (F8.2.T1)", () => {
  it("crea la ficha incompleta y el presupuesto queda ligado a ella (solo teléfono)", async () => {
    const { db, llamadas } = fakeDb((table, op) => {
      if (table === "examenes") return { data: [EXAMEN] };
      if (table === "pacientes" && op === "insert") return { data: FICHA_PROVISIONAL };
      if (table === "presupuestos" && op === "insert") return { data: [{ id: presupuestoRow().id }] };
      if (table === "presupuestos_examenes") return { data: [] };
      if (table === "audit_log") return { data: [] };
      if (table === "presupuestos" && op === "select") return { data: [presupuestoRow()] };
      return { data: [] };
    });

    const creado = await crearPresupuestoRepo(db, CREATE_INPUT_PROVISIONAL, "u1");

    expect(creado.paciente_id).toBe(FICHA_PROVISIONAL.id);

    const fichaInsert = llamadas.find((l) => l.table === "pacientes" && l.op === "insert");
    expect(fichaInsert?.payload).toMatchObject({
      nombre: "Juan",
      apellido: "Pérez",
      telefono: "0414-1234567",
      cedula: null,
      fecha_nacimiento: null,
      sexo: null,
    });

    const presupuestoInsert = llamadas.find((l) => l.table === "presupuestos" && l.op === "insert");
    expect(presupuestoInsert?.payload).toMatchObject({
      paciente_id: FICHA_PROVISIONAL.id,
      paciente_nombre_libre: null,
    });
  });

  it("rechaza un paciente_provisional sin teléfono ni email antes de tocar la base", async () => {
    const { db, llamadas } = fakeDb(() => ({ data: [] }));

    await expect(
      crearPresupuestoRepo(
        db,
        {
          ...CREATE_INPUT_PROVISIONAL,
          paciente_provisional: { nombre: "Juan", apellido: "Pérez" },
        },
        "u1",
      ),
    ).rejects.toThrow(CONTACTO_REQUERIDO);
    expect(llamadas).toHaveLength(0);
  });

  it("si falla el insert del presupuesto, borra la ficha recién creada", async () => {
    const { db, llamadas } = fakeDb((table, op) => {
      if (table === "examenes") return { data: [EXAMEN] };
      if (table === "pacientes" && op === "insert") return { data: FICHA_PROVISIONAL };
      if (table === "presupuestos" && op === "insert") {
        return { error: { message: "boom" } };
      }
      return { data: [] };
    });

    await expect(crearPresupuestoRepo(db, CREATE_INPUT_PROVISIONAL, "u1")).rejects.toThrow(
      "presupuestos.create",
    );

    const fichaDelete = llamadas.find((l) => l.table === "pacientes" && l.op === "delete");
    expect(fichaDelete).toBeTruthy();
  });
});

describe("presupuestos.convertToOrden — ficha incompleta (F8.2.T1)", () => {
  it("rechaza con PACIENTE_FICHA_INCOMPLETA si al paciente le falta cédula/fecha/sexo", async () => {
    const { db, llamadas } = fakeDb((table) => {
      if (table === "presupuestos") {
        return {
          data: [
            {
              id: "pres-1",
              paciente_id: FICHA_PROVISIONAL.id,
              estado: "Aprobado",
              orden_id: null,
              created_by: "u1",
            },
          ],
        };
      }
      if (table === "pacientes") {
        return { data: [{ cedula: null, fecha_nacimiento: null, sexo: null }] };
      }
      return { data: [] };
    });

    await expect(convertToOrden(db, "pres-1", "u1")).rejects.toThrow(PACIENTE_FICHA_INCOMPLETA);
    expect(llamadas.some((l) => l.table === "ordenes")).toBe(false);
  });

  it("permite convertir cuando la ficha del paciente está completa", async () => {
    const { db } = fakeDb((table) => {
      if (table === "presupuestos") {
        return {
          data: [
            {
              id: "pres-1",
              paciente_id: "pac-completo",
              estado: "Aprobado",
              orden_id: null,
              created_by: "u1",
            },
          ],
        };
      }
      if (table === "pacientes") {
        return { data: [{ cedula: "V-12345678", fecha_nacimiento: "1990-01-01", sexo: "M" }] };
      }
      if (table === "ordenes") return { data: [{ id: "orden-1" }] };
      if (table === "presupuestos_examenes") return { data: [] };
      if (table === "examenes") return { data: [] };
      if (table === "audit_log") return { data: [] };
      return { data: [] };
    });

    await expect(convertToOrden(db, "pres-1", "u1")).resolves.toMatchObject({
      orden_id: "orden-1",
    });
  });
});
