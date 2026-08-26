import { getSql, withTransaction } from "../client";

import { paqueteCreate, paqueteUpdate } from "@labo/lib/schemas/paquete";

export const PAQUETE_DUPLICADO = "PAQUETE_DUPLICADO";
export const PAQUETE_NO_ENCONTRADO = "PAQUETE_NO_ENCONTRADO";
export const EXAMEN_NO_ENCONTRADO = "EXAMEN_NO_ENCONTRADO";

const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
const PAQUETE_UNIQUE_CONSTRAINT = "paquetes_nombre_unique";

type PgErrorLike = {
  code?: string;
  constraint?: string;
};

interface PaqueteRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_base: string | number;
  created_at: Date;
}

interface PaqueteListRow extends PaqueteRow {
  examenes_count: string | number;
}

interface PaqueteExamenRow {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: string | number;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
  orden: number;
}

export interface Paquete {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_base: number;
  created_at: Date;
}

export interface PaqueteListItem extends Paquete {
  examenes_count: number;
}

export interface PaqueteExamen {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
  orden: number;
}

export interface PaqueteDetail extends Paquete {
  examenes: PaqueteExamen[];
}

function isPgError(error: unknown): error is PgErrorLike {
  return typeof error === "object" && error !== null;
}

function toDomainValidationError(error: unknown): Error {
  const firstIssue =
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as { issues?: unknown[] }).issues)
      ? (error as { issues: Array<{ message?: unknown }> }).issues[0]
      : undefined;

  const message =
    typeof firstIssue?.message === "string"
      ? firstIssue.message
      : VALIDACION_FALLIDA;

  return new Error(message);
}

function mapUniquePaqueteError(error: unknown): never {
  if (
    isPgError(error) &&
    error.code === "23505" &&
    error.constraint === PAQUETE_UNIQUE_CONSTRAINT
  ) {
    throw new Error(PAQUETE_DUPLICADO);
  }
  throw error;
}

function mapSetExamenesError(error: unknown): never {
  if (isPgError(error)) {
    if (error.code === "23503") {
      throw new Error(EXAMEN_NO_ENCONTRADO);
    }
    if (error.code === "23505") {
      throw new Error(VALIDACION_FALLIDA);
    }
  }
  throw error;
}

function toPaqueteListItem(row: PaqueteListRow): PaqueteListItem {
  return {
    ...row,
    precio_base:
      typeof row.precio_base === "number" ? row.precio_base : Number(row.precio_base),
    examenes_count:
      typeof row.examenes_count === "number"
        ? row.examenes_count
        : Number(row.examenes_count),
  };
}

function toPaquete(row: PaqueteRow): Paquete {
  return {
    ...row,
    precio_base:
      typeof row.precio_base === "number" ? row.precio_base : Number(row.precio_base),
  };
}

function toPaqueteExamen(row: PaqueteExamenRow): PaqueteExamen {
  return {
    ...row,
    precio_usd:
      typeof row.precio_usd === "number" ? row.precio_usd : Number(row.precio_usd),
  };
}

function parseExamenIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new Error(VALIDACION_FALLIDA);
  }

  const ids = input.map((value) => {
    if (typeof value !== "string") {
      throw new Error(VALIDACION_FALLIDA);
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(VALIDACION_FALLIDA);
    }

    return trimmed;
  });

  if (new Set(ids).size !== ids.length) {
    throw new Error(VALIDACION_FALLIDA);
  }

  return ids;
}

export async function list(): Promise<PaqueteListItem[]> {
  const sql = getSql();
  const rows = await sql<PaqueteListRow[]>`
    SELECT p.id,
           p.nombre,
           p.descripcion,
           p.precio_base,
           p.created_at,
           COUNT(pe.examen_id)::int AS examenes_count
    FROM paquetes p
    LEFT JOIN paquetes_examenes pe ON pe.paquete_id = p.id
    GROUP BY p.id, p.nombre, p.descripcion, p.precio_base, p.created_at
    ORDER BY p.nombre ASC, p.created_at ASC
  `;

  return rows.map(toPaqueteListItem);
}

export async function getById(id: string): Promise<PaqueteDetail | null> {
  const sql = getSql();
  const paqueteRows = await sql<PaqueteRow[]>`
    SELECT id, nombre, descripcion, precio_base, created_at
    FROM paquetes
    WHERE id = ${id}
    LIMIT 1
  `;

  const paquete = paqueteRows[0];
  if (!paquete) return null;

  const examenRows = await sql<PaqueteExamenRow[]>`
    SELECT e.id,
           e.titulo_id,
           e.nombre,
           e.precio_usd,
           e.unidad,
           e.valores_referencia,
           e.activo,
           pe.orden
    FROM paquetes_examenes pe
    INNER JOIN examenes e ON e.id = pe.examen_id
    WHERE pe.paquete_id = ${id}
    ORDER BY pe.orden ASC, e.nombre ASC
  `;

  return {
    ...toPaquete(paquete),
    examenes: examenRows.map(toPaqueteExamen),
  };
}

export async function getExamenes(id: string): Promise<PaqueteExamen[]> {
  const sql = getSql();
  const paqueteRows = await sql<{ id: string }[]>`
    SELECT id
    FROM paquetes
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!paqueteRows[0]) {
    throw new Error(PAQUETE_NO_ENCONTRADO);
  }

  const rows = await sql<PaqueteExamenRow[]>`
    SELECT e.id,
           e.titulo_id,
           e.nombre,
           e.precio_usd,
           e.unidad,
           e.valores_referencia,
           e.activo,
           pe.orden
    FROM paquetes_examenes pe
    INNER JOIN examenes e ON e.id = pe.examen_id
    WHERE pe.paquete_id = ${id}
      AND e.activo = true
    ORDER BY pe.orden ASC, e.nombre ASC
  `;

  return rows.map(toPaqueteExamen);
}

export async function create(input: unknown): Promise<Paquete> {
  const parsed = paqueteCreate.safeParse(input);
  if (!parsed.success) {
    throw toDomainValidationError(parsed.error);
  }

  const payload = {
    nombre: parsed.data.nombre,
    descripcion: parsed.data.descripcion ?? null,
    precio_base: parsed.data.precio_base,
  };

  const sql = getSql();
  try {
    const rows = await sql<PaqueteRow[]>`
      INSERT INTO paquetes ${sql(payload)}
      RETURNING id, nombre, descripcion, precio_base, created_at
    `;
    return toPaquete(rows[0]!);
  } catch (error) {
    mapUniquePaqueteError(error);
  }
}

export async function update(id: string, input: unknown): Promise<Paquete> {
  const parsed = paqueteUpdate.safeParse(input);
  if (!parsed.success) {
    throw toDomainValidationError(parsed.error);
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.nombre !== undefined) patch.nombre = parsed.data.nombre;
  if (Object.prototype.hasOwnProperty.call(parsed.data, "descripcion")) {
    patch.descripcion = parsed.data.descripcion ?? null;
  }
  if (parsed.data.precio_base !== undefined) patch.precio_base = parsed.data.precio_base;

  if (Object.keys(patch).length === 0) {
    const existing = await getById(id);
    if (!existing) throw new Error(PAQUETE_NO_ENCONTRADO);
    return existing;
  }

  try {
    const sql = getSql();
    const columns = Object.keys(patch) as Array<keyof typeof patch>;
    const rows = await sql<PaqueteRow[]>`
      UPDATE paquetes
      SET ${sql(patch, ...columns)}
      WHERE id = ${id}
      RETURNING id, nombre, descripcion, precio_base, created_at
    `;

    const paquete = rows[0];
    if (!paquete) throw new Error(PAQUETE_NO_ENCONTRADO);
    return toPaquete(paquete);
  } catch (error) {
    mapUniquePaqueteError(error);
  }
}

async function deletePaquete(id: string): Promise<Paquete> {
  const sql = getSql();
  const rows = await sql<PaqueteRow[]>`
    DELETE FROM paquetes
    WHERE id = ${id}
    RETURNING id, nombre, descripcion, precio_base, created_at
  `;

  const paquete = rows[0];
  if (!paquete) throw new Error(PAQUETE_NO_ENCONTRADO);
  return toPaquete(paquete);
}

export { deletePaquete as delete };

export async function setExamenes(
  id: string,
  examenIdsInput: unknown,
): Promise<PaqueteExamen[]> {
  const examenIds = parseExamenIds(examenIdsInput);

  try {
    return await withTransaction(async (tx) => {
      const paqueteRows = await tx<{ id: string }[]>`
        SELECT id
        FROM paquetes
        WHERE id = ${id}
        LIMIT 1
      `;
      if (!paqueteRows[0]) {
        throw new Error(PAQUETE_NO_ENCONTRADO);
      }

      for (const examenId of examenIds) {
        const examenRows = await tx<{ id: string }[]>`
          SELECT id
          FROM examenes
          WHERE id = ${examenId}
            AND activo = true
          LIMIT 1
        `;
        if (!examenRows[0]) {
          throw new Error(EXAMEN_NO_ENCONTRADO);
        }
      }

      await tx`
        DELETE FROM paquetes_examenes
        WHERE paquete_id = ${id}
      `;

      if (examenIds.length > 0) {
        const values = examenIds.map((examenId, index) => ({
          paquete_id: id,
          examen_id: examenId,
          orden: index + 1,
        }));

        await tx`
          INSERT INTO paquetes_examenes ${tx(values, "paquete_id", "examen_id", "orden")}
        `;
      }

      const rows = await tx<PaqueteExamenRow[]>`
        SELECT e.id,
               e.titulo_id,
               e.nombre,
               e.precio_usd,
               e.unidad,
               e.valores_referencia,
               e.activo,
               pe.orden
        FROM paquetes_examenes pe
        INNER JOIN examenes e ON e.id = pe.examen_id
        WHERE pe.paquete_id = ${id}
          AND e.activo = true
        ORDER BY pe.orden ASC, e.nombre ASC
      `;

      return rows.map(toPaqueteExamen);
    });
  } catch (error) {
    mapSetExamenesError(error);
  }
}
