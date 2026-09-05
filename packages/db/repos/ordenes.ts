import type { Db } from "../sdk";
import { ENTREGA_REQUIERE_VALORES, assertPuedeEntregarse } from "@labo/lib/entrega-orden";
import {
  estadoOrdenSchema,
  ordenCreateSchema,
  ordenUpdateSchema,
  type EstadoOrden,
} from "@labo/lib/schemas/orden";

// ─────────────────────────────────────────────────────────────────────────────
// Códigos de error de dominio
// ─────────────────────────────────────────────────────────────────────────────

export const ORDEN_NO_ENCONTRADA = "ORDEN_NO_ENCONTRADA";
export const RESULTADO_NO_ENCONTRADO = ORDEN_NO_ENCONTRADA; // alias legacy
export const PACIENTE_NO_ENCONTRADO = "PACIENTE_NO_ENCONTRADO";
export const EXAMEN_NO_ENCONTRADO = "EXAMEN_NO_ENCONTRADO";
export const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
export const ESTADO_FECHA_INCOHERENTE = "ESTADO_FECHA_INCOHERENTE";
export const ESTADO_REQUIERE_FECHA_RESULTADO = "ESTADO_REQUIERE_FECHA_RESULTADO";
/** Re-export: una orden no se entrega con líneas sin valor (ver @labo/lib/entrega-orden). */
export { ENTREGA_REQUIERE_VALORES };

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SEARCH_LIMIT = 50;
const ENTITY_TYPE = "ordenes";

/**
 * Transiciones válidas del pipeline operativo.
 *   Registrada → Muestra tomada → En proceso → Validando → Entregada
 *              └──────────────────────────────────────┴→ Anulada (terminal)
 *
 * Permitimos "retroceder" un paso (ej. Validando → En proceso) para corregir
 * errores. Cualquiera puede pasar a Anulada.
 */
export const TRANSICIONES_ESTADO_ORDEN: Readonly<
  Record<EstadoOrden, readonly EstadoOrden[]>
> = {
  Registrada: ["Muestra tomada", "Anulada"],
  "Muestra tomada": ["En proceso", "Registrada", "Anulada"],
  "En proceso": ["Validando", "Muestra tomada", "Anulada"],
  Validando: ["Entregada", "En proceso", "Anulada"],
  Entregada: ["Anulada"],
  Anulada: [],
};

export const TRANSICION_ORDEN_INVALIDA = "TRANSICION_ORDEN_INVALIDA";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Numeric = number | string;

interface OrdenRow {
  id: string;
  paciente_id: string;
  fecha_muestra: string;
  fecha_resultado: string | null;
  medico_solicitante: string | null;
  estado: EstadoOrden;
  observaciones: string | null;
  origen_presupuesto_id: string | null;
  created_at: string;
  created_by: string;
}

interface LineaRow {
  id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: Numeric;
  unidad_snap: string | null;
  valores_referencia_snap: string | null;
  tipo_analisis_snap: string | null;
  metodo_snap: string | null;
  valor: string;
  observacion: string | null;
  orden: number;
}

interface CatalogoRow {
  id: string;
  nombre: string;
  precio_usd: Numeric;
  unidad: string | null;
  valores_referencia: string | null;
  tipo_analisis: string | null;
  metodo: string | null;
}

export interface OrdenFilters {
  pacienteId?: string;
  estado?: EstadoOrden;
  desde?: string | Date;
  hasta?: string | Date;
}

export interface OrdenListInput {
  page?: number;
  limit?: number;
  filters?: OrdenFilters;
}

export interface OrdenLinea extends Omit<LineaRow, "precio_snap"> {
  precio_snap: number;
}

export interface Orden extends OrdenRow {}

export interface OrdenListItem extends OrdenRow {
  paciente_nombre: string;
  paciente_apellido: string;
  paciente_cedula: string;
  examenes_count: number;
}

export interface OrdenDetail extends Orden {
  examenes: OrdenLinea[];
}

export interface OrdenListResult {
  items: OrdenListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface OrdenSearchInput {
  term: string;
  filters?: OrdenFilters;
}

export interface OrdenPaciente {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: string;
  sexo: "M" | "F" | "O" | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
}

export interface OrdenConfig {
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
  logo_url: string | null;
  firma_url: string | null;
  sello_url: string | null;
  pdf_pie_pagina: string | null;
}

export interface OrdenLineaPDF extends OrdenLinea {
  /** Grupo (`examenes_titulos.nombre`) vigente en el catálogo; null si el examen fue eliminado. */
  titulo: string | null;
}

export interface OrdenForPDF extends Omit<OrdenDetail, "examenes"> {
  examenes: OrdenLineaPDF[];
  paciente: OrdenPaciente;
  config: OrdenConfig | null;
}

export type AssetUrlResolver = (objectKey: string) => Promise<string>;

// Aliases legacy — código viejo que aún usa "Resultado" en los nombres.
export type Resultado = Orden;
export type ResultadoDetail = OrdenDetail;
export type ResultadoLinea = OrdenLinea;
export type ResultadoListItem = OrdenListItem;
export type ResultadoListResult = OrdenListResult;
export type ResultadoListInput = OrdenListInput;
export type ResultadoSearchInput = OrdenSearchInput;
export type ResultadoFilters = OrdenFilters;
export type ResultadoForPDF = OrdenForPDF;
export type ResultadoLineaPDF = OrdenLineaPDF;
export type ResultadoPaciente = OrdenPaciente;
export type ResultadoConfig = OrdenConfig;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizePagination(input: OrdenListInput) {
  const page = Number.isFinite(input.page) ? Math.trunc(input.page!) : DEFAULT_PAGE;
  const limit = Number.isFinite(input.limit) ? Math.trunc(input.limit!) : DEFAULT_LIMIT;
  return {
    page: Math.max(DEFAULT_PAGE, page),
    limit: Math.min(MAX_LIMIT, Math.max(1, limit)),
  };
}

function coerceDates(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const data = { ...(input as Record<string, unknown>) };
  for (const key of ["fecha_muestra", "fecha_resultado"] as const) {
    const value = data[key];
    if (value instanceof Date) data[key] = value.getTime();
    else if (typeof value === "string") {
      const ts = new Date(value).getTime();
      if (!Number.isNaN(ts)) data[key] = ts;
    }
  }
  return data;
}

function validationError(error: { issues?: Array<{ message?: unknown }> }): Error {
  const message = error.issues?.find((i) => typeof i.message === "string")?.message;
  return new Error(typeof message === "string" ? message : VALIDACION_FALLIDA);
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapLinea<T extends LineaRow>(row: T): OrdenLinea {
  return { ...row, precio_snap: Number(row.precio_snap) };
}

async function auditBestEffort(
  db: Db,
  row: {
    usuarioId: string | null;
    accion: string;
    entityId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    usuario_id: row.usuarioId,
    accion: row.accion,
    entity_type: ENTITY_TYPE,
    entity_id: row.entityId,
    metadata: row.metadata,
  });
  if (error) console.warn(`[audit ${row.accion}]`, error.message);
}

const LINEA_COLS =
  "id, examen_id, nombre_snap, precio_snap, unidad_snap, valores_referencia_snap, " +
  "tipo_analisis_snap, metodo_snap, valor, observacion, orden";

const ORDEN_COLS =
  "id, paciente_id, fecha_muestra, fecha_resultado, medico_solicitante, " +
  "estado, observaciones, origen_presupuesto_id, created_at, created_by";

// ─────────────────────────────────────────────────────────────────────────────
// Lectura de líneas
// ─────────────────────────────────────────────────────────────────────────────

async function fetchLineas(db: Db, ordenId: string): Promise<OrdenLinea[]> {
  const { data, error } = await db
    .from("ordenes_examenes")
    .select(LINEA_COLS)
    .eq("orden_id", ordenId)
    .order("orden", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`ordenes.fetchLineas: ${error.message}`);
  return (((data ?? []) as unknown) as LineaRow[]).map(mapLinea);
}

/**
 * Líneas para PDF: además de los snapshots, resuelve el grupo vigente
 * (`examenes_titulos.nombre`) del catálogo. Si el examen fue eliminado, el
 * titulo queda null y la línea cae en un bucket residual del informe.
 */
async function fetchLineasForPDF(
  db: Db,
  ordenId: string,
): Promise<OrdenLineaPDF[]> {
  const { data, error } = await db
    .from("ordenes_examenes")
    .select(
      `${LINEA_COLS}, examenes ( titulo_id, examenes_titulos ( nombre ) )`,
    )
    .eq("orden_id", ordenId)
    .order("orden", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`ordenes.fetchLineasForPDF: ${error.message}`);

  type Nested = LineaRow & {
    examenes?: {
      titulo_id?: string;
      examenes_titulos?: { nombre?: string } | null;
    } | null;
  };
  return ((data ?? []) as Nested[]).map((row) => ({
    ...mapLinea(row),
    titulo: row.examenes?.examenes_titulos?.nombre ?? null,
  }));
}

async function insertLineas(
  db: Db,
  ordenId: string,
  examenes: Array<{ examen_id: string; valor: string; observacion?: string }>,
  existing: Map<string, OrdenLinea> = new Map(),
): Promise<void> {
  if (examenes.length === 0) return;

  const ids = Array.from(new Set(examenes.map((l) => l.examen_id)));
  const catRes = await db
    .from("examenes")
    .select(
      "id, nombre, precio_usd, unidad, valores_referencia, tipo_analisis, metodo",
    )
    .in("id", ids)
    .eq("activo", true);
  if (catRes.error) throw new Error(`ordenes.insertLineas cat: ${catRes.error.message}`);
  const catalog = new Map(
    ((catRes.data ?? []) as CatalogoRow[]).map((row) => [row.id, row]),
  );

  const values = examenes.map((linea, index) => {
    const snap = existing.get(linea.examen_id);
    const src = catalog.get(linea.examen_id);
    if (!snap && !src) throw new Error(EXAMEN_NO_ENCONTRADO);
    return {
      orden_id: ordenId,
      examen_id: linea.examen_id,
      nombre_snap: snap?.nombre_snap ?? src!.nombre,
      precio_snap: snap?.precio_snap ?? Number(src!.precio_usd),
      unidad_snap: snap?.unidad_snap ?? src!.unidad,
      valores_referencia_snap:
        snap?.valores_referencia_snap ?? src!.valores_referencia,
      tipo_analisis_snap: snap?.tipo_analisis_snap ?? src!.tipo_analisis,
      metodo_snap: snap?.metodo_snap ?? src!.metodo,
      valor: linea.valor,
      observacion: trimOrNull(linea.observacion),
      orden: index + 1,
    };
  });

  const ins = await db.from("ordenes_examenes").insert(values);
  if (ins.error) throw new Error(`ordenes.insertLineas ins: ${ins.error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura de órdenes
// ─────────────────────────────────────────────────────────────────────────────

async function loadListItems(
  db: Db,
  rows: OrdenRow[],
): Promise<OrdenListItem[]> {
  if (rows.length === 0) return [];
  const ordenIds = rows.map((r) => r.id);
  const pacIds = Array.from(new Set(rows.map((r) => r.paciente_id)));

  const [pacRes, exCountRes] = await Promise.all([
    db.from("pacientes").select("id, nombre, apellido, cedula").in("id", pacIds),
    db.from("ordenes_examenes").select("orden_id").in("orden_id", ordenIds),
  ]);
  if (pacRes.error) throw new Error(`ordenes.loadList pac: ${pacRes.error.message}`);
  if (exCountRes.error)
    throw new Error(`ordenes.loadList count: ${exCountRes.error.message}`);

  const pacById = new Map(
    ((pacRes.data ?? []) as Array<{
      id: string;
      nombre: string;
      apellido: string;
      cedula: string;
    }>).map((p) => [p.id, p]),
  );
  const countBy = new Map<string, number>();
  for (const r of (exCountRes.data ?? []) as Array<{ orden_id: string }>) {
    countBy.set(r.orden_id, (countBy.get(r.orden_id) ?? 0) + 1);
  }

  return rows.map((r) => {
    const p = pacById.get(r.paciente_id);
    return {
      ...r,
      paciente_nombre: p?.nombre ?? "",
      paciente_apellido: p?.apellido ?? "",
      paciente_cedula: p?.cedula ?? "",
      examenes_count: countBy.get(r.id) ?? 0,
    };
  });
}

export async function list(
  db: Db,
  input: OrdenListInput = {},
): Promise<OrdenListResult> {
  const { page, limit } = normalizePagination(input);
  const filters = input.filters ?? {};

  // Tipo mínimo del builder del SDK: sólo los filtros que usamos, cada uno
  // devolviendo el mismo builder para poder encadenar.
  type Filtrable<T> = {
    eq: (column: string, value: unknown) => T;
    gte: (column: string, value: unknown) => T;
    lt: (column: string, value: unknown) => T;
  };
  const applyFilters = <T extends Filtrable<T>>(q: T): T => {
    let out = q;
    if (filters.pacienteId?.trim()) out = out.eq("paciente_id", filters.pacienteId.trim());
    if (filters.estado) out = out.eq("estado", filters.estado);
    if (filters.desde) {
      const iso =
        filters.desde instanceof Date ? filters.desde.toISOString() : filters.desde;
      out = out.gte("fecha_muestra", iso);
    }
    if (filters.hasta) {
      // "menor que el día siguiente" — replica el `< hasta + 1 day` original.
      const base = filters.hasta instanceof Date ? filters.hasta : new Date(filters.hasta);
      const next = new Date(base);
      next.setUTCDate(next.getUTCDate() + 1);
      out = out.lt("fecha_muestra", next.toISOString());
    }
    return out;
  };

  const countBase = db.from("ordenes").select("id", { count: "exact", head: true });
  const countRes = await applyFilters(countBase);
  if (countRes.error) throw new Error(`ordenes.list count: ${countRes.error.message}`);

  const listBase = db
    .from("ordenes")
    .select(ORDEN_COLS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  const listRes = await applyFilters(listBase);
  if (listRes.error) throw new Error(`ordenes.list: ${listRes.error.message}`);

  const items = await loadListItems(db, ((listRes.data ?? []) as unknown) as OrdenRow[]);
  const total = countRes.count ?? 0;
  return {
    items,
    page,
    limit,
    total,
    totalPages: total ? Math.ceil(total / limit) : 0,
  };
}

export async function search(
  db: Db,
  input: OrdenSearchInput,
): Promise<OrdenListItem[]> {
  const term = input.term.trim();
  if (!term) return [];
  const pattern = `%${term}%`;

  // 1) Pacientes que matchean por nombre/apellido/cedula.
  const pacRes = await db
    .from("pacientes")
    .select("id")
    .or(
      `nombre.ilike.${pattern},apellido.ilike.${pattern},cedula.ilike.${pattern}`,
    );
  if (pacRes.error) throw new Error(`ordenes.search pac: ${pacRes.error.message}`);
  const pacIds = ((pacRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);

  if (pacIds.length === 0) return [];

  // 2) Órdenes de esos pacientes (limita) — aplicando filtros extra si vienen.
  const filters = input.filters ?? {};
  let q = db
    .from("ordenes")
    .select(ORDEN_COLS)
    .in("paciente_id", pacIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SEARCH_LIMIT);
  if (filters.estado) q = q.eq("estado", filters.estado);

  const res = await q;
  if (res.error) throw new Error(`ordenes.search: ${res.error.message}`);
  return loadListItems(db, ((res.data ?? []) as unknown) as OrdenRow[]);
}

export async function getById(db: Db, id: string): Promise<OrdenDetail | null> {
  const { data, error } = await db
    .from("ordenes")
    .select(ORDEN_COLS)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(`ordenes.getById: ${error.message}`);
  const row = ((data?.[0] as unknown) as OrdenRow | undefined) ?? null;
  if (!row) return null;
  return { ...row, examenes: await fetchLineas(db, id) };
}

export async function getForPDF(
  db: Db,
  id: string,
  resolveAssetUrl: AssetUrlResolver,
): Promise<OrdenForPDF | null> {
  const orden = await getById(db, id);
  if (!orden) return null;

  const [examenes, pacRes, configRes] = await Promise.all([
    fetchLineasForPDF(db, id),
    db
      .from("pacientes")
      .select(
        "id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono, email, direccion",
      )
      .eq("id", orden.paciente_id)
      .limit(1),
    db
      .from("laboratorio_config")
      .select(
        "nombre, direccion, telefono, email, rif, colegio_bioanalistas, mpps, logo_object_key, firma_object_key, sello_object_key, pdf_pie_pagina",
      )
      .eq("singleton", true)
      .limit(1),
  ]);

  if (pacRes.error) throw new Error(`ordenes.getForPDF pac: ${pacRes.error.message}`);
  if (configRes.error)
    throw new Error(`ordenes.getForPDF config: ${configRes.error.message}`);

  const paciente = pacRes.data?.[0] as OrdenPaciente | undefined;
  if (!paciente) throw new Error(PACIENTE_NO_ENCONTRADO);

  const configRow = configRes.data?.[0] as
    | Omit<OrdenConfig, "logo_url" | "firma_url" | "sello_url">
    | undefined;
  let config: OrdenConfig | null = null;
  if (configRow) {
    const resolve = async (key: string | null) =>
      key ? resolveAssetUrl(key) : null;
    const [logo_url, firma_url, sello_url] = await Promise.all([
      resolve(configRow.logo_object_key),
      resolve(configRow.firma_object_key),
      resolve(configRow.sello_object_key),
    ]);
    config = { ...configRow, logo_url, firma_url, sello_url };
  }

  return { ...orden, examenes, paciente, config };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export async function create(
  db: Db,
  input: unknown,
  usuarioId: string,
): Promise<OrdenDetail> {
  const parsed = ordenCreateSchema.safeParse(coerceDates(input));
  if (!parsed.success) throw validationError(parsed.error);
  const data = parsed.data;

  const pacRes = await db
    .from("pacientes")
    .select("id")
    .eq("id", data.paciente_id)
    .eq("activo", true)
    .limit(1);
  if (pacRes.error) throw new Error(`ordenes.create pac: ${pacRes.error.message}`);
  if (!pacRes.data?.[0]) throw new Error(PACIENTE_NO_ENCONTRADO);

  const fechaResultado = data.fecha_resultado
    ? new Date(data.fecha_resultado).toISOString()
    : null;
  // Estado explícito si vino; si no, se deriva de la fecha de resultado.
  const estado: EstadoOrden = data.estado ?? (fechaResultado ? "Entregada" : "Registrada");
  if (estado === "Entregada" && !fechaResultado) throw new Error(ESTADO_REQUIERE_FECHA_RESULTADO);
  if (estado === "Registrada" && fechaResultado) throw new Error(ESTADO_FECHA_INCOHERENTE);
  // Al entregar no puede haber valores en blanco.
  if (estado === "Entregada") assertPuedeEntregarse(data.examenes);

  const insRes = await db
    .from("ordenes")
    .insert({
      paciente_id: data.paciente_id,
      fecha_muestra: new Date(data.fecha_muestra).toISOString(),
      fecha_resultado: fechaResultado,
      medico_solicitante: trimOrNull(data.medico_solicitante),
      estado,
      observaciones: trimOrNull(data.observaciones),
      created_by: usuarioId,
    })
    .select(ORDEN_COLS)
    .limit(1);
  if (insRes.error) throw new Error(`ordenes.create: ${insRes.error.message}`);
  const orden = (insRes.data?.[0] as unknown) as OrdenRow | undefined;
  if (!orden) throw new Error("ordenes.create: sin fila retornada");

  await insertLineas(db, orden.id, data.examenes);
  await auditBestEffort(db, {
    usuarioId,
    accion: "ordenes.create",
    entityId: orden.id,
    metadata: { paciente_id: data.paciente_id, examenes: data.examenes.length },
  });

  return { ...orden, examenes: await fetchLineas(db, orden.id) };
}

export async function update(
  db: Db,
  id: string,
  input: unknown,
  usuarioId: string,
): Promise<OrdenDetail> {
  const coerced = coerceDates(input);
  const inputRecord =
    coerced && typeof coerced === "object" && !Array.isArray(coerced)
      ? (coerced as Record<string, unknown>)
      : null;
  const clearsFechaResultado = inputRecord?.fecha_resultado === null;
  const schemaInput = clearsFechaResultado
    ? Object.fromEntries(
        Object.entries(inputRecord).filter(([k]) => k !== "fecha_resultado"),
      )
    : coerced;
  const parsed = ordenUpdateSchema.safeParse(schemaInput);
  if (!parsed.success) throw validationError(parsed.error);
  const data = parsed.data;

  const current = await getById(db, id);
  if (!current) throw new Error(ORDEN_NO_ENCONTRADA);

  const fechaMuestra = data.fecha_muestra
    ? new Date(data.fecha_muestra).toISOString()
    : current.fecha_muestra;
  let fechaResultado: string | null = clearsFechaResultado
    ? null
    : data.fecha_resultado === undefined
      ? current.fecha_resultado
      : new Date(data.fecha_resultado).toISOString();

  if (data.estado === "Registrada") {
    if (data.fecha_resultado !== undefined) throw new Error(ESTADO_FECHA_INCOHERENTE);
    fechaResultado = null;
  } else if (data.estado === "Entregada" && !fechaResultado) {
    throw new Error(ESTADO_REQUIERE_FECHA_RESULTADO);
  }
  if (fechaResultado && new Date(fechaResultado) < new Date(fechaMuestra)) {
    throw new Error("FECHA_RESULTADO_ANTERIOR_MUESTRA");
  }

  // Regla de auto-cálculo cuando NO viene estado explícito:
  //   - Si hay fecha_resultado → Entregada.
  //   - Si no, mantener el estado actual (permite flujo intermedio: Muestra
  //     tomada / En proceso / Validando).
  const estadoFinal: EstadoOrden =
    data.estado ?? (fechaResultado ? "Entregada" : current.estado);

  // Regla de entrega: si la orden queda (o sigue) Entregada, todas las líneas
  // resultantes deben tener valor. Se evalúa sobre lo que va a quedar guardado.
  if (estadoFinal === "Entregada") {
    assertPuedeEntregarse(data.examenes ?? current.examenes);
  }

  const patch: Record<string, unknown> = {
    fecha_muestra: fechaMuestra,
    fecha_resultado: fechaResultado,
    estado: estadoFinal,
  };
  if (data.medico_solicitante !== undefined) {
    patch.medico_solicitante = trimOrNull(data.medico_solicitante);
  }
  if (data.observaciones !== undefined) {
    patch.observaciones = trimOrNull(data.observaciones);
  }

  const upd = await db.from("ordenes").update(patch).eq("id", id);
  if (upd.error) throw new Error(`ordenes.update: ${upd.error.message}`);

  if (data.examenes) {
    const snapshots = new Map(current.examenes.map((l) => [l.examen_id, l]));
    const del = await db.from("ordenes_examenes").delete().eq("orden_id", id);
    if (del.error) throw new Error(`ordenes.update del: ${del.error.message}`);
    await insertLineas(db, id, data.examenes, snapshots);
  }

  await auditBestEffort(db, {
    usuarioId,
    accion: "ordenes.update",
    entityId: id,
    metadata: { fields: Object.keys(data) },
  });

  const updated = await getById(db, id);
  if (!updated) throw new Error(ORDEN_NO_ENCONTRADA);
  return updated;
}

export async function updateEstado(
  db: Db,
  id: string,
  estadoInput: unknown,
  usuarioId: string,
): Promise<OrdenDetail> {
  const parsed = estadoOrdenSchema.safeParse(estadoInput);
  if (!parsed.success) throw validationError(parsed.error);

  const current = await getById(db, id);
  if (!current) throw new Error(ORDEN_NO_ENCONTRADA);

  // Validar transición contra la matriz. Idempotente: same-state no dispara error.
  if (parsed.data !== current.estado) {
    const permitidos = TRANSICIONES_ESTADO_ORDEN[current.estado];
    if (!permitidos.includes(parsed.data)) {
      throw new Error(TRANSICION_ORDEN_INVALIDA);
    }
  }

  const patch: Record<string, unknown> = { estado: parsed.data };
  if (parsed.data === "Entregada") {
    // No se entrega un informe con resultados en blanco (ni sin exámenes).
    assertPuedeEntregarse(current.examenes);
    // Si pasa a Entregada sin fecha_resultado, la seteamos ahora.
    if (!current.fecha_resultado) patch.fecha_resultado = new Date().toISOString();
  } else if (parsed.data === "Registrada") {
    // Retroceder a Registrada limpia la fecha de resultado.
    patch.fecha_resultado = null;
  }

  const upd = await db.from("ordenes").update(patch).eq("id", id);
  if (upd.error) throw new Error(`ordenes.updateEstado: ${upd.error.message}`);

  await auditBestEffort(db, {
    usuarioId,
    accion: "ordenes.update_estado",
    entityId: id,
    metadata: { estado_anterior: current.estado, estado: parsed.data },
  });

  const updated = await getById(db, id);
  if (!updated) throw new Error(ORDEN_NO_ENCONTRADA);
  return updated;
}

async function deleteOrden(
  db: Db,
  id: string,
  usuarioId: string,
): Promise<Orden> {
  const before = await db
    .from("ordenes")
    .select(ORDEN_COLS)
    .eq("id", id)
    .limit(1);
  if (before.error) throw new Error(`ordenes.delete: ${before.error.message}`);
  const row = (before.data?.[0] as unknown) as OrdenRow | undefined;
  if (!row) throw new Error(ORDEN_NO_ENCONTRADA);

  const del = await db.from("ordenes").delete().eq("id", id);
  if (del.error) throw new Error(`ordenes.delete: ${del.error.message}`);

  await auditBestEffort(db, {
    usuarioId,
    accion: "ordenes.delete",
    entityId: id,
    metadata: { paciente_id: row.paciente_id },
  });

  return row;
}

export { deleteOrden as delete };
