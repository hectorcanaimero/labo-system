import postgres from "postgres";
import type { Sql, TransactionSql } from "postgres";

/**
 * Cliente Postgres compartido (postgres.js), singleton por proceso.
 *
 * ADR-11: acceso a datos de dominio via postgres.js directo (no ORM, no REST),
 * porque las operaciones de negocio requieren transacciones multi-tabla reales
 * (snapshots, convert presupuesto → resultado, import batch WP).
 *
 * DATABASE_URL debe apuntar al Postgres provisto por InsForge (interno) o al
 * dev local. En tests, sobreescribir mediante `getSql({ url })`.
 */

let cached: Sql | null = null;

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    throw new Error(
      "[@labo/db] DATABASE_URL no está definida. Configurar en .env.local (dev) o secretos del VPS (prod).",
    );
  }
  return url;
}

/**
 * Devuelve el cliente Postgres singleton. Crea la instancia en la primera
 * llamada; llamadas siguientes reutilizan la misma pool.
 */
export function getSql(): Sql {
  if (cached !== null) return cached;
  cached = postgres(readDatabaseUrl(), {
    max: Number(process.env.DATABASE_POOL_MAX ?? "10"),
    idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT ?? "30"),
    prepare: true,
  });
  return cached;
}

/**
 * Ejecuta `fn` dentro de una transacción Postgres. Rollback automático ante
 * excepción; commit implícito al retornar OK.
 *
 * Uso típico: crear resultado + N líneas snapshot en un solo commit atómico.
 */
export async function withTransaction<T>(
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = getSql();
  return sql.begin(async (tx) => fn(tx)) as Promise<T>;
}

/**
 * Cierra la pool. Usar en teardown de tests y en shutdown ordenado del proceso.
 */
export async function closeSql(): Promise<void> {
  if (cached === null) return;
  await cached.end({ timeout: 5 });
  cached = null;
}
