import type { Db } from "../sdk";

// ─────────────────────────────────────────────────────────────────────────────
// Códigos de error de dominio
// ─────────────────────────────────────────────────────────────────────────────

export const TITULO_DUPLICADO = "TITULO_DUPLICADO";
export const TITULO_NO_ENCONTRADO = "TITULO_NO_ENCONTRADO";
export const TITULO_TIENE_EXAMENES = "TITULO_TIENE_EXAMENES";

export const EXAMEN_DUPLICADO_EN_TITULO = "EXAMEN_DUPLICADO_EN_TITULO";
export const EXAMEN_NO_ENCONTRADO = "EXAMEN_NO_ENCONTRADO";

const NOMBRE_UNIQUE_CONSTRAINT = "examenes_titulos_nombre_unique";
const EXAMEN_UNIQUE_CONSTRAINT = "examenes_titulo_nombre_unique";
const ENTITY_TYPE = "examenes_titulos";
const EXAMEN_ENTITY_TYPE = "examenes";
const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
const EXAMEN_SEARCH_LIMIT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type PgErrorLike = { code?: string; message?: string; details?: string };

function isPgError(error: unknown): error is PgErrorLike {
  return typeof error === "object" && error !== null;
}

/**
 * PostgREST devuelve `code` (postgres error code) + `message` con el nombre del
 * constraint embebido. Matcheamos ambas señales: `23505` para uniqueness y el
 * nombre del constraint dentro del message/details.
 */
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  if (!isPgError(err)) return false;
  if (err.code !== "23505") return false;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`;
  return haystack.includes(constraintName);
}

function isForeignKeyViolation(err: unknown): boolean {
  return isPgError(err) && err.code === "23503";
}

function validateNombre(nombre: unknown): string {
  if (typeof nombre !== "string" || nombre.trim().length === 0) {
    throw new Error(VALIDACION_FALLIDA);
  }
  return nombre.trim();
}

function validateOrden(orden: unknown): number {
  if (typeof orden !== "number" || !Number.isInteger(orden)) {
    throw new Error(VALIDACION_FALLIDA);
  }
  return orden;
}

function validateTituloId(tituloId: unknown): string {
  if (typeof tituloId !== "string" || tituloId.trim().length === 0) {
    throw new Error(VALIDACION_FALLIDA);
  }
  return tituloId;
}

function validatePrecioUsd(precio: unknown): number {
  if (typeof precio !== "number" || !Number.isFinite(precio) || precio < 0) {
    throw new Error(VALIDACION_FALLIDA);
  }
  return precio;
}

function trimOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function escapeLikePrefixTerm(raw: string): string {
  return raw.replace(/[\\%_]/g, "\\$&");
}

/**
 * Audit-log best-effort. Sin transacciones el audit puede fallar después de
 * que la operación principal committeó — no bloqueamos el resultado, solo
 * dejamos rastro en consola.
 */
async function auditBestEffort(
  db: Db,
  row: {
    usuarioId: string;
    accion: string;
    entityType: string;
    entityId?: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    usuario_id: row.usuarioId,
    accion: row.accion,
    entity_type: row.entityType,
    entity_id: row.entityId ?? null,
    metadata: row.metadata,
  });
  if (error) console.warn(`[audit ${row.accion}]`, error.message);
}

// =============================================================================
// Títulos (grupos)
// =============================================================================

export interface Titulo {
  id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

export interface TituloCreateInput {
  nombre: string;
  orden: number;
  usuarioId: string;
}

export interface TituloUpdateInput {
  id: string;
  nombre?: string;
  orden?: number;
  usuarioId: string;
}

export interface TituloDeleteInput {
  id: string;
  usuarioId: string;
}

export interface TituloReorderInput {
  orderedIds: string[];
  usuarioId: string;
}

const TITULO_COLS = "id, nombre, orden, created_at";

export async function titulosList(db: Db): Promise<Titulo[]> {
  const { data, error } = await db
    .from("examenes_titulos")
    .select(TITULO_COLS)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`titulosList: ${error.message}`);
  return (data ?? []) as Titulo[];
}

export async function titulosCreate(
  db: Db,
  input: TituloCreateInput,
): Promise<Titulo> {
  const nombre = validateNombre(input.nombre);
  const orden = validateOrden(input.orden);

  const { data, error } = await db
    .from("examenes_titulos")
    .insert({ nombre, orden })
    .select(TITULO_COLS)
    .limit(1);

  if (error) {
    if (isUniqueViolation(error, NOMBRE_UNIQUE_CONSTRAINT)) {
      throw new Error(TITULO_DUPLICADO);
    }
    throw new Error(`titulosCreate: ${error.message}`);
  }
  const titulo = data?.[0] as Titulo | undefined;
  if (!titulo) throw new Error("titulosCreate: sin fila retornada");

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion: "examenes_titulos.create",
    entityType: ENTITY_TYPE,
    entityId: titulo.id,
    metadata: { nombre, orden },
  });

  return titulo;
}

export async function titulosUpdate(
  db: Db,
  input: TituloUpdateInput,
): Promise<Titulo> {
  const patch: { nombre?: string; orden?: number } = {};
  if (input.nombre !== undefined) patch.nombre = validateNombre(input.nombre);
  if (input.orden !== undefined) patch.orden = validateOrden(input.orden);

  const existingRes = await db
    .from("examenes_titulos")
    .select(TITULO_COLS)
    .eq("id", input.id)
    .limit(1);
  if (existingRes.error) throw new Error(`titulosUpdate: ${existingRes.error.message}`);
  const anterior = existingRes.data?.[0] as Titulo | undefined;
  if (!anterior) throw new Error(TITULO_NO_ENCONTRADO);

  if (Object.keys(patch).length === 0) return anterior;

  const { data, error } = await db
    .from("examenes_titulos")
    .update(patch)
    .eq("id", input.id)
    .select(TITULO_COLS)
    .limit(1);
  if (error) {
    if (isUniqueViolation(error, NOMBRE_UNIQUE_CONSTRAINT)) {
      throw new Error(TITULO_DUPLICADO);
    }
    throw new Error(`titulosUpdate: ${error.message}`);
  }
  const titulo = data?.[0] as Titulo | undefined;
  if (!titulo) throw new Error(TITULO_NO_ENCONTRADO);

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion: "examenes_titulos.update",
    entityType: ENTITY_TYPE,
    entityId: titulo.id,
    metadata: {
      anterior: { nombre: anterior.nombre, orden: anterior.orden },
      nuevo: patch,
    },
  });

  return titulo;
}

export async function titulosDelete(
  db: Db,
  input: TituloDeleteInput,
): Promise<Titulo> {
  const existingRes = await db
    .from("examenes_titulos")
    .select(TITULO_COLS)
    .eq("id", input.id)
    .limit(1);
  if (existingRes.error) throw new Error(`titulosDelete: ${existingRes.error.message}`);
  const titulo = existingRes.data?.[0] as Titulo | undefined;
  if (!titulo) throw new Error(TITULO_NO_ENCONTRADO);

  const hijosRes = await db
    .from("examenes")
    .select("id", { count: "exact", head: true })
    .eq("titulo_id", input.id)
    .eq("activo", true);
  if (hijosRes.error) throw new Error(`titulosDelete: ${hijosRes.error.message}`);
  if ((hijosRes.count ?? 0) > 0) throw new Error(TITULO_TIENE_EXAMENES);

  const { error: delError } = await db
    .from("examenes_titulos")
    .delete()
    .eq("id", input.id);
  if (delError) {
    if (isForeignKeyViolation(delError)) throw new Error(TITULO_TIENE_EXAMENES);
    throw new Error(`titulosDelete: ${delError.message}`);
  }

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion: "examenes_titulos.delete",
    entityType: ENTITY_TYPE,
    entityId: titulo.id,
    metadata: { nombre: titulo.nombre, orden: titulo.orden },
  });

  return titulo;
}

export async function titulosReorder(
  db: Db,
  input: TituloReorderInput,
): Promise<string[]> {
  const ids = input.orderedIds;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some((id) => typeof id !== "string" || id.length === 0)
  ) {
    throw new Error(VALIDACION_FALLIDA);
  }

  for (let i = 0; i < ids.length; i++) {
    const { data, error } = await db
      .from("examenes_titulos")
      .update({ orden: i + 1 })
      .eq("id", ids[i])
      .select("id")
      .limit(1);
    if (error) throw new Error(`titulosReorder: ${error.message}`);
    if (!data?.[0]) throw new Error(TITULO_NO_ENCONTRADO);
  }

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion: "examenes_titulos.reorder",
    entityType: ENTITY_TYPE,
    metadata: { orderedIds: ids },
  });

  return ids;
}

// =============================================================================
// Exámenes
// =============================================================================

interface ExamenRow {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: string | number;
  unidad: string | null;
  valores_referencia: string | null;
  tipo_analisis: string;
  metodo: string | null;
  observaciones: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Examen {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  valores_referencia: string | null;
  tipo_analisis: string;
  metodo: string | null;
  observaciones: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExamenSearchItem {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  activo: boolean;
}

export interface ExamenCreateInput {
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad?: string;
  valores_referencia?: string;
  tipo_analisis: string;
  metodo?: string;
  observaciones?: string;
  usuarioId: string;
}

export interface ExamenUpdateInput {
  id: string;
  nombre?: string;
  precio_usd?: number;
  unidad?: string;
  valores_referencia?: string;
  tipo_analisis?: string;
  metodo?: string;
  observaciones?: string;
  usuarioId: string;
}

const EXAMEN_COLS =
  "id, titulo_id, nombre, precio_usd, unidad, valores_referencia, tipo_analisis, metodo, observaciones, activo, created_at, updated_at";

function toExamen(row: ExamenRow): Examen {
  return {
    ...row,
    precio_usd:
      typeof row.precio_usd === "number" ? row.precio_usd : Number(row.precio_usd),
  };
}

function toExamenSearchItem(row: ExamenRow): ExamenSearchItem {
  return {
    id: row.id,
    titulo_id: row.titulo_id,
    nombre: row.nombre,
    precio_usd:
      typeof row.precio_usd === "number" ? row.precio_usd : Number(row.precio_usd),
    unidad: row.unidad,
    activo: row.activo,
  };
}

export async function examenesListByTitulo(
  db: Db,
  input: { titulo_id: string },
): Promise<Examen[]> {
  const tituloId = validateTituloId(input.titulo_id);
  const { data, error } = await db
    .from("examenes")
    .select(EXAMEN_COLS)
    .eq("titulo_id", tituloId)
    .eq("activo", true)
    .order("nombre", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`examenesListByTitulo: ${error.message}`);
  return (data ?? []).map((r) => toExamen(r as ExamenRow));
}

export async function examenesSearch(
  db: Db,
  input: { term: string },
): Promise<ExamenSearchItem[]> {
  const term = typeof input.term === "string" ? input.term.trim() : "";
  if (term.length === 0) return [];

  const pattern = `${escapeLikePrefixTerm(term)}%`;
  const { data, error } = await db
    .from("examenes")
    .select("id, titulo_id, nombre, precio_usd, unidad, activo")
    .eq("activo", true)
    .ilike("nombre", pattern)
    .order("nombre", { ascending: true })
    .limit(EXAMEN_SEARCH_LIMIT);
  if (error) throw new Error(`examenesSearch: ${error.message}`);
  return (data ?? []).map((r) => toExamenSearchItem(r as ExamenRow));
}

export async function examenesGetById(
  db: Db,
  input: { id: string },
): Promise<Examen | null> {
  const { data, error } = await db
    .from("examenes")
    .select(EXAMEN_COLS)
    .eq("id", input.id)
    .limit(1);
  if (error) throw new Error(`examenesGetById: ${error.message}`);
  const row = data?.[0] as ExamenRow | undefined;
  return row ? toExamen(row) : null;
}

export async function examenesCreate(
  db: Db,
  input: ExamenCreateInput,
): Promise<Examen> {
  const tituloId = validateTituloId(input.titulo_id);
  const nombre = validateNombre(input.nombre);
  const precioUsd = validatePrecioUsd(input.precio_usd);
  const tipoAnalisis = validateNombre(input.tipo_analisis); // required
  const unidad = trimOrNull(input.unidad);
  const valoresReferencia = trimOrNull(input.valores_referencia);
  const metodo = trimOrNull(input.metodo);
  const observaciones = trimOrNull(input.observaciones);

  const tituloCheck = await db
    .from("examenes_titulos")
    .select("id", { head: true, count: "exact" })
    .eq("id", tituloId);
  if (tituloCheck.error) throw new Error(`examenesCreate: ${tituloCheck.error.message}`);
  if ((tituloCheck.count ?? 0) === 0) throw new Error(TITULO_NO_ENCONTRADO);

  const { data, error } = await db
    .from("examenes")
    .insert({
      titulo_id: tituloId,
      nombre,
      precio_usd: precioUsd,
      unidad,
      valores_referencia: valoresReferencia,
      tipo_analisis: tipoAnalisis,
      metodo,
      observaciones,
    })
    .select(EXAMEN_COLS)
    .limit(1);

  if (error) {
    if (isUniqueViolation(error, EXAMEN_UNIQUE_CONSTRAINT)) {
      throw new Error(EXAMEN_DUPLICADO_EN_TITULO);
    }
    if (isForeignKeyViolation(error)) throw new Error(TITULO_NO_ENCONTRADO);
    throw new Error(`examenesCreate: ${error.message}`);
  }
  const row = data?.[0] as ExamenRow | undefined;
  if (!row) throw new Error("examenesCreate: sin fila retornada");
  const examen = toExamen(row);

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion: "examenes.create",
    entityType: EXAMEN_ENTITY_TYPE,
    entityId: examen.id,
    metadata: {
      titulo_id: tituloId,
      nombre,
      precio_usd: precioUsd,
      unidad,
      valores_referencia: valoresReferencia,
      tipo_analisis: tipoAnalisis,
      metodo,
      observaciones,
    },
  });

  return examen;
}

export async function examenesUpdate(
  db: Db,
  input: ExamenUpdateInput,
): Promise<Examen> {
  const patch: Record<string, unknown> = {};
  if (input.nombre !== undefined) patch.nombre = validateNombre(input.nombre);
  if (input.precio_usd !== undefined) {
    patch.precio_usd = validatePrecioUsd(input.precio_usd);
  }
  if (input.unidad !== undefined) patch.unidad = trimOrNull(input.unidad);
  if (input.valores_referencia !== undefined) {
    patch.valores_referencia = trimOrNull(input.valores_referencia);
  }
  if (input.tipo_analisis !== undefined) {
    patch.tipo_analisis = validateNombre(input.tipo_analisis);
  }
  if (input.metodo !== undefined) patch.metodo = trimOrNull(input.metodo);
  if (input.observaciones !== undefined) {
    patch.observaciones = trimOrNull(input.observaciones);
  }

  const existing = await examenesGetById(db, { id: input.id });
  if (!existing) throw new Error(EXAMEN_NO_ENCONTRADO);
  if (Object.keys(patch).length === 0) return existing;

  patch.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("examenes")
    .update(patch)
    .eq("id", input.id)
    .select(EXAMEN_COLS)
    .limit(1);
  if (error) {
    if (isUniqueViolation(error, EXAMEN_UNIQUE_CONSTRAINT)) {
      throw new Error(EXAMEN_DUPLICADO_EN_TITULO);
    }
    throw new Error(`examenesUpdate: ${error.message}`);
  }
  const row = data?.[0] as ExamenRow | undefined;
  if (!row) throw new Error(EXAMEN_NO_ENCONTRADO);
  const examen = toExamen(row);

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion: "examenes.update",
    entityType: EXAMEN_ENTITY_TYPE,
    entityId: examen.id,
    metadata: {
      anterior: {
        nombre: existing.nombre,
        precio_usd: existing.precio_usd,
        unidad: existing.unidad,
        valores_referencia: existing.valores_referencia,
        tipo_analisis: existing.tipo_analisis,
        metodo: existing.metodo,
        observaciones: existing.observaciones,
      },
      nuevo: patch,
    },
  });

  return examen;
}

async function setExamenActivo(
  db: Db,
  input: { id: string; usuarioId: string },
  activo: boolean,
  accion: "examenes.deactivate" | "examenes.activate",
): Promise<Examen> {
  const anterior = await examenesGetById(db, { id: input.id });
  if (!anterior) throw new Error(EXAMEN_NO_ENCONTRADO);

  const { data, error } = await db
    .from("examenes")
    .update({ activo, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .select(EXAMEN_COLS)
    .limit(1);
  if (error) throw new Error(`${accion}: ${error.message}`);
  const row = data?.[0] as ExamenRow | undefined;
  if (!row) throw new Error(EXAMEN_NO_ENCONTRADO);
  const examen = toExamen(row);

  await auditBestEffort(db, {
    usuarioId: input.usuarioId,
    accion,
    entityType: EXAMEN_ENTITY_TYPE,
    entityId: examen.id,
    metadata: { nombre: anterior.nombre, titulo_id: anterior.titulo_id },
  });

  return examen;
}

export async function examenesDeactivate(
  db: Db,
  input: { id: string; usuarioId: string },
): Promise<Examen> {
  return setExamenActivo(db, input, false, "examenes.deactivate");
}

export async function examenesActivate(
  db: Db,
  input: { id: string; usuarioId: string },
): Promise<Examen> {
  return setExamenActivo(db, input, true, "examenes.activate");
}

// =============================================================================
// Import batch (planilla Excel)
// =============================================================================

export interface ImportBatchResult {
  titulos_creados: number;
  examenes_creados: number;
  examenes_actualizados: number;
  duplicados_ignorados: number;
}

export interface ImportBatchInputRow {
  titulo: string;
  nombre: string;
  precio_usd: number;
  unidad?: string;
  valores_referencia?: string;
  tipo_analisis?: string;
  metodo?: string;
  observaciones?: string;
}

export async function examenesImportBatch(
  db: Db,
  rows: ImportBatchInputRow[],
  usuarioId: string,
): Promise<ImportBatchResult> {
  if (rows.length === 0) {
    return {
      titulos_creados: 0,
      examenes_creados: 0,
      examenes_actualizados: 0,
      duplicados_ignorados: 0,
    };
  }

  let titulosCreados = 0;
  let examenesCreados = 0;
  let examenesActualizados = 0;

  // 1) Cargar títulos existentes
  const titulosMap = new Map<string, string>();
  const titulosRes = await db
    .from("examenes_titulos")
    .select("id, nombre, orden")
    .order("orden", { ascending: true });
  if (titulosRes.error) {
    throw new Error(`examenesImportBatch: ${titulosRes.error.message}`);
  }
  let nextOrden = 0;
  for (const t of (titulosRes.data ?? []) as Array<{
    id: string;
    nombre: string;
    orden: number;
  }>) {
    titulosMap.set(t.nombre.toLowerCase().trim(), t.id);
    if (t.orden > nextOrden) nextOrden = t.orden;
  }
  nextOrden += 1;

  // 2) Crear títulos que falten
  for (const row of rows) {
    const nomTitulo = row.titulo.trim();
    const key = nomTitulo.toLowerCase();
    if (titulosMap.has(key)) continue;

    const ins = await db
      .from("examenes_titulos")
      .insert({ nombre: nomTitulo, orden: nextOrden })
      .select("id, nombre")
      .limit(1);
    if (ins.error) throw new Error(`examenesImportBatch titulo: ${ins.error.message}`);
    const created = ins.data?.[0] as { id: string } | undefined;
    if (!created) throw new Error("examenesImportBatch: no se creó título");
    titulosMap.set(key, created.id);
    nextOrden++;
    titulosCreados++;

    await auditBestEffort(db, {
      usuarioId,
      accion: "examenes_titulos.import_create",
      entityType: ENTITY_TYPE,
      entityId: created.id,
      metadata: { nombre: nomTitulo },
    });
  }

  // 3) Upsert de exámenes uno a uno (PostgREST upsert acepta onConflict)
  for (const row of rows) {
    const tituloId = titulosMap.get(row.titulo.trim().toLowerCase());
    if (!tituloId) continue;

    // Chequeo previo para saber si es insert o update (PostgREST no lo dice)
    const existingRes = await db
      .from("examenes")
      .select("id")
      .eq("titulo_id", tituloId)
      .eq("nombre", row.nombre.trim())
      .limit(1);
    const existed = (existingRes.data?.length ?? 0) > 0;

    const payload = {
      titulo_id: tituloId,
      nombre: row.nombre.trim(),
      precio_usd: row.precio_usd,
      unidad: row.unidad ?? null,
      valores_referencia: row.valores_referencia ?? null,
      tipo_analisis: row.tipo_analisis?.trim() || "Otro",
      metodo: row.metodo ?? null,
      observaciones: row.observaciones ?? null,
      activo: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db
      .from("examenes")
      .upsert(payload, { onConflict: "titulo_id,nombre" });
    if (error) {
      throw new Error(`examenesImportBatch examen: ${error.message}`);
    }

    if (existed) examenesActualizados++;
    else examenesCreados++;
  }

  await auditBestEffort(db, {
    usuarioId,
    accion: "examenes.import_batch",
    entityType: EXAMEN_ENTITY_TYPE,
    metadata: {
      titulos_creados: titulosCreados,
      examenes_creados: examenesCreados,
      examenes_actualizados: examenesActualizados,
    },
  });

  return {
    titulos_creados: titulosCreados,
    examenes_creados: examenesCreados,
    examenes_actualizados: examenesActualizados,
    duplicados_ignorados: 0,
  };
}
