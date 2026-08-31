import type { Db } from "../sdk";
import {
  configUpdatePartialSchema,
  NOMBRE_REQUERIDO,
} from "@labo/lib/schemas/config";

/**
 * Configuración del laboratorio (singleton).
 *
 * El singleton se enforcea a nivel schema con la columna
 * `singleton boolean UNIQUE CHECK (singleton = true)`. El upsert atómico se
 * resuelve con `.upsert({ singleton: true, ... }, { onConflict: "singleton" })`.
 */

export interface LaboratorioConfig {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string | null;
  email: string | null;
  rif: string | null;
  colegio_bioanalistas: string | null;
  mpps: string | null;
  logo_object_key: string | null;
  firma_object_key: string | null;
  sello_object_key: string | null;
  pdf_pie_pagina: string | null;
  updated_at: string;
  updated_by: string;
}

export interface UpdateConfigInput {
  nombre?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  rif?: string;
  colegio_bioanalistas?: string;
  mpps?: string;
  pdf_pie_pagina?: string;
}

const AUDIT_ACTION = "config.update";
const ENTITY_TYPE = "laboratorio_config";

const CONFIG_COLS =
  "id, nombre, direccion, telefono, email, rif, colegio_bioanalistas, mpps, " +
  "logo_object_key, firma_object_key, sello_object_key, pdf_pie_pagina, " +
  "updated_at, updated_by";

function toDomainValidationError(error: {
  issues?: Array<{ message?: unknown }>;
}): never {
  const first = error.issues?.[0];
  const message =
    typeof first?.message === "string" ? first.message : "VALIDACION_FALLIDA";
  throw new Error(message);
}

function trimOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function auditBestEffort(
  db: Db,
  row: {
    usuarioId: string;
    entityId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    usuario_id: row.usuarioId,
    accion: AUDIT_ACTION,
    entity_type: ENTITY_TYPE,
    entity_id: row.entityId,
    metadata: row.metadata,
  });
  if (error) console.warn(`[audit ${AUDIT_ACTION}]`, error.message);
}

/**
 * Retorna la fila singleton o `null` en el primer arranque.
 */
export async function get(db: Db): Promise<LaboratorioConfig | null> {
  const { data, error } = await db
    .from("laboratorio_config")
    .select(CONFIG_COLS)
    .eq("singleton", true)
    .limit(1);
  if (error) throw new Error(`config.get: ${error.message}`);
  return ((data?.[0] as unknown) as LaboratorioConfig | undefined) ?? null;
}

/**
 * Upsert atómico (por `singleton = true`). Merge de campos previos + partial.
 */
export async function update(
  db: Db,
  input: unknown,
  usuarioId: string,
): Promise<LaboratorioConfig> {
  const parsed = configUpdatePartialSchema.safeParse(input);
  if (!parsed.success) toDomainValidationError(parsed.error);
  const data = parsed.data as UpdateConfigInput;

  const current = await get(db);

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
  const rif =
    data.rif !== undefined ? trimOrNull(data.rif) : (current?.rif ?? null);
  const colegioBioanalistas =
    data.colegio_bioanalistas !== undefined
      ? trimOrNull(data.colegio_bioanalistas)
      : (current?.colegio_bioanalistas ?? null);
  const mpps =
    data.mpps !== undefined ? trimOrNull(data.mpps) : (current?.mpps ?? null);
  const pdf =
    data.pdf_pie_pagina !== undefined
      ? trimOrNull(data.pdf_pie_pagina)
      : (current?.pdf_pie_pagina ?? null);

  if (!nombre || nombre.trim().length === 0) {
    throw new Error(NOMBRE_REQUERIDO);
  }

  const payload = {
    singleton: true,
    nombre,
    direccion,
    telefono,
    email,
    rif,
    colegio_bioanalistas: colegioBioanalistas,
    mpps,
    pdf_pie_pagina: pdf,
    updated_by: usuarioId,
    updated_at: new Date().toISOString(),
  };

  const { data: rows, error } = await db
    .from("laboratorio_config")
    .upsert(payload, { onConflict: "singleton" })
    .select(CONFIG_COLS)
    .limit(1);
  if (error) throw new Error(`config.update: ${error.message}`);
  const row = (rows?.[0] as unknown) as LaboratorioConfig | undefined;
  if (!row) throw new Error("No se pudo guardar la configuración del laboratorio.");

  await auditBestEffort(db, {
    usuarioId,
    entityId: row.id,
    metadata: { input: { ...data } },
  });

  return row;
}

/**
 * Actualiza el object key de un asset (logo/firma/sello). Si no existe la fila
 * singleton, la crea con placeholders de nombre/dirección.
 */
export async function updateAssetKey(
  db: Db,
  type: "logo" | "firma" | "sello",
  key: string | null,
  usuarioId: string,
): Promise<LaboratorioConfig> {
  const current = await get(db);
  const nowIso = new Date().toISOString();

  const logoKey = type === "logo" ? key : (current?.logo_object_key ?? null);
  const firmaKey = type === "firma" ? key : (current?.firma_object_key ?? null);
  const selloKey = type === "sello" ? key : (current?.sello_object_key ?? null);

  const payload = {
    singleton: true,
    nombre: current?.nombre ?? "Nuevo Laboratorio",
    direccion: current?.direccion ?? "",
    telefono: current?.telefono ?? null,
    email: current?.email ?? null,
    rif: current?.rif ?? null,
    colegio_bioanalistas: current?.colegio_bioanalistas ?? null,
    mpps: current?.mpps ?? null,
    pdf_pie_pagina: current?.pdf_pie_pagina ?? null,
    logo_object_key: logoKey,
    firma_object_key: firmaKey,
    sello_object_key: selloKey,
    updated_by: usuarioId,
    updated_at: nowIso,
  };

  const { data: rows, error } = await db
    .from("laboratorio_config")
    .upsert(payload, { onConflict: "singleton" })
    .select(CONFIG_COLS)
    .limit(1);
  if (error) throw new Error(`config.updateAssetKey: ${error.message}`);
  const row = (rows?.[0] as unknown) as LaboratorioConfig | undefined;
  if (!row) throw new Error(`No se pudo actualizar el asset ${type} en la configuración.`);

  await auditBestEffort(db, {
    usuarioId,
    entityId: row.id,
    metadata: { asset_type: type, object_key: key },
  });

  return row;
}
