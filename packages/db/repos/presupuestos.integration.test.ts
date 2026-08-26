import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeSql } from "../client";
import {
  cambiarEstado,
  list as listPresupuestos,
  TRANSICION_ESTADO_INVALIDA,
} from "./presupuestos";

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

  it("cambiarEstado ejecuta transiciones válidas Borrador → Enviado → Aprobado", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Borrador");

    const enviado = await cambiarEstado(id, "Enviado", undefined, usuarioId);
    expect(enviado.estado).toBe("Enviado");

    const aprobado = await cambiarEstado(id, "Aprobado", undefined, usuarioId);
    expect(aprobado.estado).toBe("Aprobado");
  });

  it("cambiarEstado rechaza transición no permitida con TRANSICION_ESTADO_INVALIDA", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Borrador");

    await expectError(
      () => cambiarEstado(id, "Aprobado", undefined, usuarioId),
      TRANSICION_ESTADO_INVALIDA,
    );
  });

  it("cambiarEstado a Rechazado persiste motivo_rechazo y lo limpia al volver a Borrador", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Enviado");

    await cambiarEstado(id, "Rechazado", "Precio fuera de presupuesto", usuarioId);

    const rechazado = await sql<{ estado: string; motivo_rechazo: string | null }[]>`
      SELECT estado, motivo_rechazo FROM presupuestos WHERE id = ${id}
    `;
    expect(rechazado[0].estado).toBe("Rechazado");
    expect(rechazado[0].motivo_rechazo).toBe("Precio fuera de presupuesto");

    await cambiarEstado(id, "Borrador", undefined, usuarioId);

    const borrador = await sql<{ estado: string; motivo_rechazo: string | null }[]>`
      SELECT estado, motivo_rechazo FROM presupuestos WHERE id = ${id}
    `;
    expect(borrador[0].estado).toBe("Borrador");
    expect(borrador[0].motivo_rechazo).toBeNull();
  });

  it("cambiarEstado a Rechazado sin motivo lanza MOTIVO_RECHAZO_REQUERIDO", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Enviado");

    await expectError(
      () => cambiarEstado(id, "Rechazado", undefined, usuarioId),
      "MOTIVO_RECHAZO_REQUERIDO",
    );
  });

  it("cambiarEstado registra audit_log con metadata de la transición", async () => {
    const usuarioId = await crearUsuario();
    const pacienteId = await crearPaciente();
    const id = await crearPresupuesto(pacienteId, "Borrador");

    await cambiarEstado(id, "Enviado", undefined, usuarioId);

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

  it("list filtra por array de estados", async () => {
    const pacienteId = await crearPaciente();
    await crearPresupuesto(pacienteId, "Borrador");
    await crearPresupuesto(pacienteId, "Enviado");
    await crearPresupuesto(pacienteId, "Aprobado");

    const dosEstados = await listPresupuestos({
      filters: { paciente_id: pacienteId, estados: ["Borrador", "Enviado"] },
    });
    expect(dosEstados.total).toBe(2);
    expect(dosEstados.items.map((item) => item.estado).sort()).toEqual([
      "Borrador",
      "Enviado",
    ]);

    const uno = await listPresupuestos({
      filters: { paciente_id: pacienteId, estados: ["Aprobado"] },
    });
    expect(uno.total).toBe(1);
    expect(uno.items[0].estado).toBe("Aprobado");
  });
});
