import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("presupuestos — DDL CHECKs (integración Postgres)", () => {
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
  });

  afterAll(async () => {
    await sql?.end();
  });

  async function crearPaciente(): Promise<string> {
    const cedula = `V-${Math.floor(10000000 + Math.random() * 89999999)}`;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO pacientes (nombre, apellido, cedula, fecha_nacimiento)
      VALUES (${"Juan"}, ${"Pérez"}, ${cedula}, ${new Date("1990-01-01T00:00:00.000Z")})
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
});
