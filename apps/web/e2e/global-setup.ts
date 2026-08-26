import fs from "node:fs";
import path from "node:path";

import type { FullConfig } from "@playwright/test";
import postgres from "postgres";

/**
 * Global setup (F4.1.T5).
 *
 * Corre ANTES de los tests (y del webServer). Siembra un Postgres efímero con
 * datos deterministas para que los 5 specs partan del mismo estado conocido:
 * usuarios (admin + operador), catálogo de exámenes, un paciente, tasa BCV,
 * config del laboratorio y un presupuesto en Borrador.
 *
 * - Aplica `packages/db/schema.sql` sólo si la base está vacía (idempotente:
 *   un dev local con el schema ya migrado no lo vuelve a aplicar).
 * - `TRUNCATE ... CASCADE` + inserts con UUIDs fijos → reruns reproducibles.
 */

interface SeedUser {
  id: string;
  authUserId: string;
  email: string;
  password: string;
  nombre: string;
  role: "admin" | "operador";
}

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "[e2e] DATABASE_URL no está definida. Apuntá a un Postgres disponible " +
        "(local o el servicio `postgres` del job E2E).",
    );
  }
  return url;
}

function resolveRepoRoot(config: FullConfig): string {
  if (config.configFile) {
    return path.resolve(path.dirname(config.configFile), "..", "..");
  }
  return process.cwd();
}

function loadSeedUsers(config: FullConfig): SeedUser[] {
  const root = resolveRepoRoot(config);
  const file = path.join(root, "apps", "web", "e2e", "fixtures", "seed-users.json");
  const raw = fs.readFileSync(file, "utf8");
  return (JSON.parse(raw) as { users: SeedUser[] }).users;
}

function readSchemaSql(config: FullConfig): string {
  const root = resolveRepoRoot(config);
  const file = path.join(root, "packages", "db", "schema.sql");
  return fs.readFileSync(file, "utf8");
}

// ─── Datos de catálogo / operación (UUIDs fijos) ────────────────────────────

const TITULO_HEMATOLOGIA = "30000000-0000-4000-8000-000000000001";
const EXAMEN_HEMOGRAMA = "30000000-0000-4000-8000-000000000101";
const EXAMEN_GLICEMIA = "30000000-0000-4000-8000-000000000102";
const PACIENTE_MARIA = "40000000-0000-4000-8000-000000000001";
const TASA_BCV = "50000000-0000-4000-8000-000000000001";
const PRESUPUESTO_SEED = "60000000-0000-4000-8000-000000000001";
const PRESUPUESTO_LINEA = "60000000-0000-4000-8000-000000000101";
const CONFIG_LAB = "20000000-0000-4000-8000-000000000001";

const TRUNCATE_SQL = `
TRUNCATE TABLE
  resultados_examenes,
  presupuestos_examenes,
  paquetes_examenes,
  migration_map,
  audit_log,
  resultados,
  presupuestos,
  paquetes,
  tasa_cambio_bcv,
  pacientes,
  examenes,
  examenes_titulos,
  usuarios,
  laboratorio_config
RESTART IDENTITY CASCADE;
`;

function seedCatalogSql(adminId: string, operadorId: string): string {
  return `
INSERT INTO laboratorio_config (id, nombre, direccion, telefono, email, rif, updated_by) VALUES
  ('${CONFIG_LAB}', 'Laboratorio de Pruebas E2E', 'Av. Siempre Viva 742', '+58 212 555-0100', 'contacto@labsystem.dev', 'J-12345678-9', '${adminId}');

INSERT INTO examenes_titulos (id, nombre, orden) VALUES
  ('${TITULO_HEMATOLOGIA}', 'Hematología', 1);

INSERT INTO examenes (id, titulo_id, nombre, precio_usd, unidad, valores_referencia, activo) VALUES
  ('${EXAMEN_HEMOGRAMA}', '${TITULO_HEMATOLOGIA}', 'Hemograma Completo', 25.00, 'x10^3/uL', '4.5 - 11.0', true),
  ('${EXAMEN_GLICEMIA}', '${TITULO_HEMATOLOGIA}', 'Glicemia', 10.00, 'mg/dL', '70 - 110', true);

INSERT INTO pacientes (id, nombre, apellido, cedula, fecha_nacimiento, sexo, activo) VALUES
  ('${PACIENTE_MARIA}', 'María', 'Pérez', 'V-12345678', '1990-01-01', 'F', true);

INSERT INTO tasa_cambio_bcv (id, tasa, fecha, fuente, created_by) VALUES
  ('${TASA_BCV}', 36.5000, now(), 'manual', '${adminId}');

INSERT INTO presupuestos (id, paciente_id, descuento_pct, ganancia_pct, tasa_bs, total_usd, total_bs, estado, created_by) VALUES
  ('${PRESUPUESTO_SEED}', '${PACIENTE_MARIA}', 0, 30, 36.5000, 32.50, 1186.25, 'Borrador', '${operadorId}');

INSERT INTO presupuestos_examenes (id, presupuesto_id, examen_id, nombre_snap, precio_snap, precio_base_snap, ganancia_pct, precio_final_snap, orden) VALUES
  ('${PRESUPUESTO_LINEA}', '${PRESUPUESTO_SEED}', '${EXAMEN_HEMOGRAMA}', 'Hemograma Completo', 25.00, 25.00, 30, 32.50, 0);
`;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const databaseUrl = readDatabaseUrl();
  const users = loadSeedUsers(config);
  const admin = users.find((u) => u.role === "admin");
  const operador = users.find((u) => u.role === "operador");
  if (!admin || !operador) {
    throw new Error("[e2e] Fixtures de seed-users.json incompletas: falta admin u operador.");
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const hasSchema = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'pacientes'
      ) AS exists
    `;

    if (!hasSchema[0]?.exists) {
      await sql.unsafe(readSchemaSql(config));
    }

    await sql.unsafe(TRUNCATE_SQL);

    const usuariosValues = users
      .map(
        (u) =>
          `('${u.id}', '${u.authUserId}', '${u.email}', '${u.nombre}', '${u.role}', true)`,
      )
      .join(",\n  ");

    await sql.unsafe(`
INSERT INTO usuarios (id, auth_user_id, email, nombre, role, activo) VALUES
  ${usuariosValues};
`);

    await sql.unsafe(seedCatalogSql(admin.id, operador.id));

    // eslint-disable-next-line no-console
    console.log("[e2e] Seed completado:", {
      usuarios: users.length,
      examenes: 2,
      pacientes: 1,
      presupuestos: 1,
    });
  } finally {
    await sql.end();
  }
}
