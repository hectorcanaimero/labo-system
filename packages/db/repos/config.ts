import { getSql, withTransaction } from "@labo/db/client";
import {
  configUpdatePartialSchema,
  NOMBRE_REQUERIDO,
} from "@labo/lib/schemas/config";

/**
 * Configuración del laboratorio (singleton) — F1.1.T5 (ADR-11).
 *
 * Repo SQL sobre `laboratorio_config`. El patrón singleton elegido es una
 * columna dedicada `singleton boolean NOT NULL DEFAULT true UNIQUE CHECK
 * (singleton = true)` (definida en F0.1.T8). El upsert atómico se resuelve con
 * `INSERT ... ON CONFLICT (singleton) DO UPDATE`, por lo que NUNCA puede haber
 * más de una fila (el UNIQUE sobre `singleton` es la última red).
 */

export interface LaboratorioConfig {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string | null;
  email: string | null;
  rif: string | null;
  logo_object_key: string | null;
  firma_object_key: string | null;
  sello_object_key: string | null;
  pdf_pie_pagina: string | null;
  updated_at: Date;
  updated_by: string;
}

export interface UpdateConfigInput {
  nombre?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  rif?: string;
  pdf_pie_pagina?: string;
}

const AUDIT_ACTION = "config.update";
const ENTITY_TYPE = "laboratorio_config";

/** Extrae el código del primer issue de Zod y lo lanza como `Error`. */
function toDomainValidationError(error: {
  issues?: Array<{ message?: unknown }>;
}): never {
  const firstIssue = error.issues?.[0];
  const message =
    typeof firstIssue?.message === "string"
      ? firstIssue.message
      : "VALIDACION_FALLIDA";
  throw new Error(message);
}

/** Trims y mapea "" → null (para columnas nullable). `undefined` → null. */
function trimOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Retorna la fila singleton o `null` en el primer arranque (antes de que un
 * Admin guarde la configuración inicial).
 */
export async function get(): Promise<LaboratorioConfig | null> {
  const sql = getSql();
  const rows = await sql<LaboratorioConfig[]>`
    SELECT id, nombre, direccion, telefono, email, rif,
           logo_object_key, firma_object_key, sello_object_key,
           pdf_pie_pagina, updated_at, updated_by
    FROM laboratorio_config
    WHERE singleton = true
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Upsert atómico de la configuración (Admin only — el guard vive en el route
 * handler). Acepta un partial: los campos omitidos preservan el valor previo;
 * los campos presentes se validan con `configUpdatePartialSchema` (nombre no
 * vacío, RIF con regex). Registra `config.update` en `audit_log`.
 *
 * - Si no existe fila → INSERT (requiere `nombre` no vacío; `direccion` omite
 *   → "").
 * - Si existe → UPDATE mergeando sólo los campos provistos.
 */
export async function update(
  input: unknown,
  usuarioId: string,
): Promise<LaboratorioConfig> {
  const parsed = configUpdatePartialSchema.safeParse(input);
  if (!parsed.success) {
    toDomainValidationError(parsed.error);
  }
  const data = parsed.data as UpdateConfigInput;

  return withTransaction(async (tx) => {
    const existing = await tx<LaboratorioConfig[]>`
      SELECT id, nombre, direccion, telefono, email, rif,
             logo_object_key, firma_object_key, sello_object_key,
             pdf_pie_pagina, updated_at, updated_by
      FROM laboratorio_config
      WHERE singleton = true
      LIMIT 1
    `;
    const current = existing[0] ?? null;

    // Merge: campo presente en el partial pisa el actual; si no viene, se
    // conserva el valor previo (o null/"" en el primer arranque).
    const nombre =
      data.nombre !== undefined ? data.nombre.trim() : (current?.nombre ?? null);
    const direccion =
      data.direccion !== undefined
        ? data.direccion.trim()
        : (current?.direccion ?? "");
    const telefono =
      data.telefono !== undefined
        ? trimOrNull(data.telefono)
        : (current?.telefono ?? null);
    const email =
      data.email !== undefined ? trimOrNull(data.email) : (current?.email ?? null);
    const rif = data.rif !== undefined ? trimOrNull(data.rif) : (current?.rif ?? null);
    const pdf =
      data.pdf_pie_pagina !== undefined
        ? trimOrNull(data.pdf_pie_pagina)
        : (current?.pdf_pie_pagina ?? null);

    // Primer arranque: `nombre` es NOT NULL y debe venir no vacío (si ya
    // vino en el partial, el schema ya lo rechazó vacío).
    if (!nombre || nombre.trim().length === 0) {
      throw new Error(NOMBRE_REQUERIDO);
    }

    const rows = await tx<LaboratorioConfig[]>`
      INSERT INTO laboratorio_config
        (singleton, nombre, direccion, telefono, email, rif, pdf_pie_pagina, updated_by)
      VALUES (
        true,
        ${nombre},
        ${direccion},
        ${telefono},
        ${email},
        ${rif},
        ${pdf},
        ${usuarioId}
      )
      ON CONFLICT (singleton) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        direccion = EXCLUDED.direccion,
        telefono = EXCLUDED.telefono,
        email = EXCLUDED.email,
        rif = EXCLUDED.rif,
        pdf_pie_pagina = EXCLUDED.pdf_pie_pagina,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by
      RETURNING id, nombre, direccion, telefono, email, rif,
                logo_object_key, firma_object_key, sello_object_key,
                pdf_pie_pagina, updated_at, updated_by
    `;

    const row = rows[0];
    if (!row) {
      throw new Error("No se pudo guardar la configuración del laboratorio.");
    }

    await tx`
      INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (
        ${usuarioId},
        ${AUDIT_ACTION},
        ${ENTITY_TYPE},
        ${row.id},
        ${tx.json({ input: data } as any)}
      )
    `;

    return row;
  });
}

/**
 * Actualiza el object key de un asset (logo, firma, sello) en el singleton `laboratorio_config`.
 * Si no existe la fila singleton, la crea.
 * Registra un log de auditoría "config.update" con el campo modificado.
 */
export async function updateAssetKey(
  type: "logo" | "firma" | "sello",
  key: string | null,
  usuarioId: string,
): Promise<LaboratorioConfig> {
  return withTransaction(async (tx) => {
    // Buscar la config existente
    const existing = await tx<LaboratorioConfig[]>`
      SELECT id, nombre, direccion, telefono, email, rif,
             logo_object_key, firma_object_key, sello_object_key,
             pdf_pie_pagina, updated_at, updated_by
      FROM laboratorio_config
      WHERE singleton = true
      LIMIT 1
    `;
    const current = existing[0] ?? null;

    let row: LaboratorioConfig;

    if (!current) {
      // Primer arranque: si no existe, creamos con nombre y dirección por defecto
      const nombre = "Nuevo Laboratorio";
      const direccion = "";
      
      const logo_key = type === "logo" ? key : null;
      const firma_key = type === "firma" ? key : null;
      const sello_key = type === "sello" ? key : null;

      const rows = await tx<LaboratorioConfig[]>`
        INSERT INTO laboratorio_config
          (singleton, nombre, direccion, logo_object_key, firma_object_key, sello_object_key, updated_by)
        VALUES (
          true,
          ${nombre},
          ${direccion},
          ${logo_key},
          ${firma_key},
          ${sello_key},
          ${usuarioId}
        )
        RETURNING id, nombre, direccion, telefono, email, rif,
                  logo_object_key, firma_object_key, sello_object_key,
                  pdf_pie_pagina, updated_at, updated_by
      `;
      row = rows[0];
    } else {
      // Actualizamos la columna dinámica usando consulta segura
      const logo_key = type === "logo" ? key : current.logo_object_key;
      const firma_key = type === "firma" ? key : current.firma_object_key;
      const sello_key = type === "sello" ? key : current.sello_object_key;

      const rows = await tx<LaboratorioConfig[]>`
        UPDATE laboratorio_config
        SET
          logo_object_key = ${logo_key},
          firma_object_key = ${firma_key},
          sello_object_key = ${sello_key},
          updated_at = now(),
          updated_by = ${usuarioId}
        WHERE singleton = true
        RETURNING id, nombre, direccion, telefono, email, rif,
                  logo_object_key, firma_object_key, sello_object_key,
                  pdf_pie_pagina, updated_at, updated_by
      `;
      row = rows[0];
    }

    if (!row) {
      throw new Error(`No se pudo actualizar el asset ${type} en la configuración.`);
    }

    // Registrar en auditoría
    await tx`
      INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (
        ${usuarioId},
        ${AUDIT_ACTION},
        ${ENTITY_TYPE},
        ${row.id},
        ${tx.json({ asset_type: type, object_key: key } as any)}
      )
    `;

    return row;
  });
}
