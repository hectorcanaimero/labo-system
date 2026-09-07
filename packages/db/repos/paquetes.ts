import type { Db } from "../sdk";

import { paqueteCreate, paqueteUpdate } from "@labo/lib/schemas/paquete";

export const PAQUETE_DUPLICADO = "PAQUETE_DUPLICADO";
export const PAQUETE_NO_ENCONTRADO = "PAQUETE_NO_ENCONTRADO";
export const EXAMEN_NO_ENCONTRADO = "EXAMEN_NO_ENCONTRADO";
export const TITULO_NO_ENCONTRADO = "TITULO_NO_ENCONTRADO";

const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
const PAQUETE_UNIQUE_CONSTRAINT = "paquetes_nombre_unique";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PaqueteRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_base: string | number;
  created_at: string;
}

export interface Paquete {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_base: number;
  created_at: string;
}

export interface PaqueteListItem extends Paquete {
  examenes_count: number;
  titulos_count: number;
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

export interface PaqueteTitulo {
  id: string;
  nombre: string;
  orden: number;
  examenes_activos_count: number;
}

export interface PaqueteDetail extends Paquete {
  examenes: PaqueteExamen[];
  titulos: PaqueteTitulo[];
  precio_calculado: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error helpers
// ─────────────────────────────────────────────────────────────────────────────

type PgErrorLike = { code?: string; message?: string; details?: string };

function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === "object" && err !== null;
}

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  if (!isPgError(err)) return false;
  if (err.code !== "23505") return false;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`;
  return haystack.includes(constraintName);
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
    typeof firstIssue?.message === "string" ? firstIssue.message : VALIDACION_FALLIDA;

  return new Error(message);
}

function toPaquete(row: PaqueteRow): Paquete {
  return {
    ...row,
    precio_base:
      typeof row.precio_base === "number" ? row.precio_base : Number(row.precio_base),
  };
}

function parseIds(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error(VALIDACION_FALLIDA);
  const ids = input.map((v) => {
    if (typeof v !== "string" || v.trim().length === 0) {
      throw new Error(VALIDACION_FALLIDA);
    }
    return v.trim();
  });
  if (new Set(ids).size !== ids.length) throw new Error(VALIDACION_FALLIDA);
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function list(db: Db): Promise<PaqueteListItem[]> {
  const paqRes = await db
    .from("paquetes")
    .select("id, nombre, descripcion, precio_base, created_at")
    .order("nombre", { ascending: true });
  if (paqRes.error) throw new Error(`paquetes.list: ${paqRes.error.message}`);
  const paquetes = (paqRes.data ?? []) as PaqueteRow[];
  if (paquetes.length === 0) return [];

  const ids = paquetes.map((p) => p.id);

  const [pxRes, ptRes] = await Promise.all([
    db.from("paquetes_examenes").select("paquete_id").in("paquete_id", ids),
    db.from("paquetes_titulos").select("paquete_id").in("paquete_id", ids),
  ]);
  if (pxRes.error) throw new Error(`paquetes.list examenes: ${pxRes.error.message}`);
  if (ptRes.error) throw new Error(`paquetes.list titulos: ${ptRes.error.message}`);

  const examCount = new Map<string, number>();
  for (const r of (pxRes.data ?? []) as Array<{ paquete_id: string }>) {
    examCount.set(r.paquete_id, (examCount.get(r.paquete_id) ?? 0) + 1);
  }
  const tituloCount = new Map<string, number>();
  for (const r of (ptRes.data ?? []) as Array<{ paquete_id: string }>) {
    tituloCount.set(r.paquete_id, (tituloCount.get(r.paquete_id) ?? 0) + 1);
  }

  return paquetes.map((p) => ({
    ...toPaquete(p),
    examenes_count: examCount.get(p.id) ?? 0,
    titulos_count: tituloCount.get(p.id) ?? 0,
  }));
}

async function loadPaqueteExamenes(
  db: Db,
  paqueteId: string,
  onlyActive: boolean,
): Promise<PaqueteExamen[]> {
  const linksRes = await db
    .from("paquetes_examenes")
    .select("examen_id, orden")
    .eq("paquete_id", paqueteId)
    .order("orden", { ascending: true });
  if (linksRes.error) throw new Error(`paquetes.examenes: ${linksRes.error.message}`);
  const links = (linksRes.data ?? []) as Array<{ examen_id: string; orden: number }>;
  if (links.length === 0) return [];

  const ids = links.map((l) => l.examen_id);
  const examQ = db
    .from("examenes")
    .select("id, titulo_id, nombre, precio_usd, unidad, valores_referencia, activo")
    .in("id", ids);
  const examRes = onlyActive ? await examQ.eq("activo", true) : await examQ;
  if (examRes.error) throw new Error(`paquetes.examenes: ${examRes.error.message}`);

  const byId = new Map<string, {
    id: string;
    titulo_id: string;
    nombre: string;
    precio_usd: string | number;
    unidad: string | null;
    valores_referencia: string | null;
    activo: boolean;
  }>();
  for (const e of (examRes.data ?? []) as Array<{
    id: string;
    titulo_id: string;
    nombre: string;
    precio_usd: string | number;
    unidad: string | null;
    valores_referencia: string | null;
    activo: boolean;
  }>) {
    byId.set(e.id, e);
  }

  return links
    .map((l) => {
      const e = byId.get(l.examen_id);
      if (!e) return null;
      return {
        id: e.id,
        titulo_id: e.titulo_id,
        nombre: e.nombre,
        precio_usd: typeof e.precio_usd === "number" ? e.precio_usd : Number(e.precio_usd),
        unidad: e.unidad,
        valores_referencia: e.valores_referencia,
        activo: e.activo,
        orden: l.orden,
      };
    })
    .filter((x): x is PaqueteExamen => x !== null);
}

async function loadPaqueteTitulos(
  db: Db,
  paqueteId: string,
): Promise<PaqueteTitulo[]> {
  const linksRes = await db
    .from("paquetes_titulos")
    .select("titulo_id, orden")
    .eq("paquete_id", paqueteId)
    .order("orden", { ascending: true });
  if (linksRes.error) throw new Error(`paquetes.titulos: ${linksRes.error.message}`);
  const links = (linksRes.data ?? []) as Array<{ titulo_id: string; orden: number }>;
  if (links.length === 0) return [];

  const ids = links.map((l) => l.titulo_id);
  const [titRes, countRes] = await Promise.all([
    db.from("examenes_titulos").select("id, nombre").in("id", ids),
    db.from("examenes").select("titulo_id").in("titulo_id", ids).eq("activo", true),
  ]);
  if (titRes.error) throw new Error(`paquetes.titulos: ${titRes.error.message}`);
  if (countRes.error) throw new Error(`paquetes.titulos: ${countRes.error.message}`);

  const nameById = new Map<string, string>();
  for (const t of (titRes.data ?? []) as Array<{ id: string; nombre: string }>) {
    nameById.set(t.id, t.nombre);
  }
  const countById = new Map<string, number>();
  for (const r of (countRes.data ?? []) as Array<{ titulo_id: string }>) {
    countById.set(r.titulo_id, (countById.get(r.titulo_id) ?? 0) + 1);
  }

  return links
    .map((l) => {
      const nombre = nameById.get(l.titulo_id);
      if (nombre === undefined) return null;
      return {
        id: l.titulo_id,
        nombre,
        orden: l.orden,
        examenes_activos_count: countById.get(l.titulo_id) ?? 0,
      };
    })
    .filter((x): x is PaqueteTitulo => x !== null);
}

/**
 * Suma sugerida = suma de precios de exámenes sueltos + suma de exámenes
 * activos de todos los grupos incluidos. Cuenta cada examen una sola vez
 * aunque aparezca en ambos (suelto + grupo).
 */
async function computePrecioCalculado(
  db: Db,
  paqueteId: string,
): Promise<number> {
  const linksRes = await db
    .from("paquetes_examenes")
    .select("examen_id")
    .eq("paquete_id", paqueteId);
  if (linksRes.error) throw new Error(`paquetes.precio: ${linksRes.error.message}`);
  const sueltosIds = new Set(
    ((linksRes.data ?? []) as Array<{ examen_id: string }>).map((r) => r.examen_id),
  );

  const tituloLinksRes = await db
    .from("paquetes_titulos")
    .select("titulo_id")
    .eq("paquete_id", paqueteId);
  if (tituloLinksRes.error) {
    throw new Error(`paquetes.precio: ${tituloLinksRes.error.message}`);
  }
  const tituloIds = ((tituloLinksRes.data ?? []) as Array<{ titulo_id: string }>).map(
    (r) => r.titulo_id,
  );

  let deGrupos: Array<{ id: string; precio_usd: string | number }> = [];
  if (tituloIds.length > 0) {
    const grupoRes = await db
      .from("examenes")
      .select("id, precio_usd")
      .in("titulo_id", tituloIds)
      .eq("activo", true);
    if (grupoRes.error) throw new Error(`paquetes.precio: ${grupoRes.error.message}`);
    deGrupos = (grupoRes.data ?? []) as typeof deGrupos;
  }

  let sueltosPrecios: Array<{ id: string; precio_usd: string | number }> = [];
  if (sueltosIds.size > 0) {
    const sueltosRes = await db
      .from("examenes")
      .select("id, precio_usd")
      .in("id", Array.from(sueltosIds))
      .eq("activo", true);
    if (sueltosRes.error) throw new Error(`paquetes.precio: ${sueltosRes.error.message}`);
    sueltosPrecios = (sueltosRes.data ?? []) as typeof sueltosPrecios;
  }

  const seen = new Set<string>();
  let total = 0;
  for (const e of [...deGrupos, ...sueltosPrecios]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    total += Number(e.precio_usd);
  }
  return Number(total.toFixed(2));
}

export async function getById(db: Db, id: string): Promise<PaqueteDetail | null> {
  const paqRes = await db
    .from("paquetes")
    .select("id, nombre, descripcion, precio_base, created_at")
    .eq("id", id)
    .limit(1);
  if (paqRes.error) throw new Error(`paquetes.getById: ${paqRes.error.message}`);
  const paqRow = paqRes.data?.[0] as PaqueteRow | undefined;
  if (!paqRow) return null;

  const [examenes, titulos, precioCalculado] = await Promise.all([
    loadPaqueteExamenes(db, id, false),
    loadPaqueteTitulos(db, id),
    computePrecioCalculado(db, id),
  ]);

  return {
    ...toPaquete(paqRow),
    examenes,
    titulos,
    precio_calculado: precioCalculado,
  };
}

export async function getExamenes(db: Db, id: string): Promise<PaqueteExamen[]> {
  const paqRes = await db.from("paquetes").select("id").eq("id", id).limit(1);
  if (paqRes.error) throw new Error(`paquetes.getExamenes: ${paqRes.error.message}`);
  if (!paqRes.data?.[0]) throw new Error(PAQUETE_NO_ENCONTRADO);
  return loadPaqueteExamenes(db, id, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

export async function create(db: Db, input: unknown): Promise<Paquete> {
  const parsed = paqueteCreate.safeParse(input);
  if (!parsed.success) throw toDomainValidationError(parsed.error);

  const { data, error } = await db
    .from("paquetes")
    .insert({
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion ?? null,
      precio_base: parsed.data.precio_base,
    })
    .select("id, nombre, descripcion, precio_base, created_at")
    .limit(1);

  if (error) {
    if (isUniqueViolation(error, PAQUETE_UNIQUE_CONSTRAINT)) {
      throw new Error(PAQUETE_DUPLICADO);
    }
    throw new Error(`paquetes.create: ${error.message}`);
  }
  const row = data?.[0] as PaqueteRow | undefined;
  if (!row) throw new Error("paquetes.create: sin fila retornada");
  return toPaquete(row);
}

export async function update(
  db: Db,
  id: string,
  input: unknown,
): Promise<Paquete> {
  const parsed = paqueteUpdate.safeParse(input);
  if (!parsed.success) throw toDomainValidationError(parsed.error);

  const patch: Record<string, unknown> = {};
  if (parsed.data.nombre !== undefined) patch.nombre = parsed.data.nombre;
  if (Object.prototype.hasOwnProperty.call(parsed.data, "descripcion")) {
    patch.descripcion = parsed.data.descripcion ?? null;
  }
  if (parsed.data.precio_base !== undefined) patch.precio_base = parsed.data.precio_base;

  if (Object.keys(patch).length === 0) {
    const existing = await getById(db, id);
    if (!existing) throw new Error(PAQUETE_NO_ENCONTRADO);
    return existing;
  }

  const { data, error } = await db
    .from("paquetes")
    .update(patch)
    .eq("id", id)
    .select("id, nombre, descripcion, precio_base, created_at")
    .limit(1);
  if (error) {
    if (isUniqueViolation(error, PAQUETE_UNIQUE_CONSTRAINT)) {
      throw new Error(PAQUETE_DUPLICADO);
    }
    throw new Error(`paquetes.update: ${error.message}`);
  }
  const row = data?.[0] as PaqueteRow | undefined;
  if (!row) throw new Error(PAQUETE_NO_ENCONTRADO);
  return toPaquete(row);
}

async function deletePaquete(db: Db, id: string): Promise<Paquete> {
  const before = await db
    .from("paquetes")
    .select("id, nombre, descripcion, precio_base, created_at")
    .eq("id", id)
    .limit(1);
  if (before.error) throw new Error(`paquetes.delete: ${before.error.message}`);
  const row = before.data?.[0] as PaqueteRow | undefined;
  if (!row) throw new Error(PAQUETE_NO_ENCONTRADO);

  const { error } = await db.from("paquetes").delete().eq("id", id);
  if (error) throw new Error(`paquetes.delete: ${error.message}`);
  return toPaquete(row);
}

export { deletePaquete as delete };

/**
 * Reemplaza el set de exámenes sueltos del paquete. NO toca los grupos
 * (paquetes_titulos), esa gestión va por `setTitulos`.
 */
export async function setExamenes(
  db: Db,
  id: string,
  examenIdsInput: unknown,
): Promise<PaqueteExamen[]> {
  const examenIds = parseIds(examenIdsInput);

  const paqRes = await db.from("paquetes").select("id").eq("id", id).limit(1);
  if (paqRes.error) throw new Error(`paquetes.setExamenes: ${paqRes.error.message}`);
  if (!paqRes.data?.[0]) throw new Error(PAQUETE_NO_ENCONTRADO);

  if (examenIds.length > 0) {
    const activosRes = await db
      .from("examenes")
      .select("id")
      .in("id", examenIds)
      .eq("activo", true);
    if (activosRes.error) {
      throw new Error(`paquetes.setExamenes: ${activosRes.error.message}`);
    }
    if ((activosRes.data?.length ?? 0) !== examenIds.length) {
      throw new Error(EXAMEN_NO_ENCONTRADO);
    }
  }

  const delRes = await db
    .from("paquetes_examenes")
    .delete()
    .eq("paquete_id", id);
  if (delRes.error) throw new Error(`paquetes.setExamenes: ${delRes.error.message}`);

  if (examenIds.length > 0) {
    const values = examenIds.map((examenId, idx) => ({
      paquete_id: id,
      examen_id: examenId,
      orden: idx + 1,
    }));
    const insRes = await db.from("paquetes_examenes").insert(values);
    if (insRes.error) throw new Error(`paquetes.setExamenes: ${insRes.error.message}`);
  }

  return loadPaqueteExamenes(db, id, true);
}

/**
 * Guarda el paquete completo en un solo llamado: precio base, exámenes sueltos
 * y grupos incluidos, aplicados en ese orden.
 *
 * El cliente de InsForge no expone transacciones, así que la atomicidad es por
 * compensación: se lee el estado previo, y si un paso falla se deshacen los
 * anteriores en orden inverso antes de relanzar el error original. Si la
 * compensación también falla, gana el error original: el paquete puede quedar
 * a medias y el llamador tiene que recargar.
 */
export async function setContenido(
  db: Db,
  id: string,
  input: unknown,
): Promise<PaqueteDetail> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(VALIDACION_FALLIDA);
  }
  const body = input as Record<string, unknown>;

  const quierePrecio = Object.prototype.hasOwnProperty.call(body, "precio_base");
  const quiereExamenes = Object.prototype.hasOwnProperty.call(body, "examenIds");
  const quiereTitulos = Object.prototype.hasOwnProperty.call(body, "tituloIds");

  // Validar todo antes de escribir nada: si el body está mal, no se toca la base.
  const parsedPrecio = quierePrecio
    ? paqueteUpdate.safeParse({ precio_base: body.precio_base })
    : null;
  if (parsedPrecio && !parsedPrecio.success) {
    throw toDomainValidationError(parsedPrecio.error);
  }
  const precioBase = parsedPrecio?.data.precio_base;
  const examenIds = quiereExamenes ? parseIds(body.examenIds) : null;
  const tituloIds = quiereTitulos ? parseIds(body.tituloIds) : null;

  const previo = await getById(db, id);
  if (!previo) throw new Error(PAQUETE_NO_ENCONTRADO);

  const deshacer: Array<() => Promise<unknown>> = [];

  try {
    if (precioBase !== undefined && precioBase !== previo.precio_base) {
      await update(db, id, { precio_base: precioBase });
      deshacer.push(() => update(db, id, { precio_base: previo.precio_base }));
    }

    if (examenIds) {
      await setExamenes(db, id, examenIds);
      deshacer.push(() =>
        setExamenes(db, id, previo.examenes.map((examen) => examen.id)),
      );
    }

    if (tituloIds) {
      await setTitulos(db, id, tituloIds);
      deshacer.push(() =>
        setTitulos(db, id, previo.titulos.map((titulo) => titulo.id)),
      );
    }
  } catch (error) {
    for (const revertir of deshacer.reverse()) {
      try {
        await revertir();
      } catch {
        // La compensación es best-effort: el error que importa es el original.
      }
    }
    throw error;
  }

  const actualizado = await getById(db, id);
  if (!actualizado) throw new Error(PAQUETE_NO_ENCONTRADO);
  return actualizado;
}

/**
 * Reemplaza el set de GRUPOS (títulos) incluidos por referencia dinámica.
 */
export async function setTitulos(
  db: Db,
  id: string,
  tituloIdsInput: unknown,
): Promise<PaqueteTitulo[]> {
  const tituloIds = parseIds(tituloIdsInput);

  const paqRes = await db.from("paquetes").select("id").eq("id", id).limit(1);
  if (paqRes.error) throw new Error(`paquetes.setTitulos: ${paqRes.error.message}`);
  if (!paqRes.data?.[0]) throw new Error(PAQUETE_NO_ENCONTRADO);

  if (tituloIds.length > 0) {
    const existRes = await db
      .from("examenes_titulos")
      .select("id")
      .in("id", tituloIds);
    if (existRes.error) throw new Error(`paquetes.setTitulos: ${existRes.error.message}`);
    if ((existRes.data?.length ?? 0) !== tituloIds.length) {
      throw new Error(TITULO_NO_ENCONTRADO);
    }
  }

  const delRes = await db
    .from("paquetes_titulos")
    .delete()
    .eq("paquete_id", id);
  if (delRes.error) throw new Error(`paquetes.setTitulos: ${delRes.error.message}`);

  if (tituloIds.length > 0) {
    const values = tituloIds.map((tituloId, idx) => ({
      paquete_id: id,
      titulo_id: tituloId,
      orden: idx + 1,
    }));
    const insRes = await db.from("paquetes_titulos").insert(values);
    if (insRes.error) throw new Error(`paquetes.setTitulos: ${insRes.error.message}`);
  }

  return loadPaqueteTitulos(db, id);
}
