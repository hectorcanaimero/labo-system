import type { Db } from "../sdk";
import {
  presupuestoCreateSchema,
  presupuestoUpdateSchema,
  presupuestoCambiarEstadoSchema,
  type EstadoPresupuesto,
} from "@labo/lib/schemas/presupuesto";
import { calcularTotales } from "@labo/lib/calcular-totales";

export const PRESUPUESTO_NO_ENCONTRADO = "PRESUPUESTO_NO_ENCONTRADO";
export const PRESUPUESTO_NO_BORRADOR = "PRESUPUESTO_NO_BORRADOR";
export const PRESUPUESTO_NO_APROBADO = "PRESUPUESTO_NO_APROBADO";
export const PACIENTE_LIBRE_REQUIERE_FICHA = "PACIENTE_LIBRE_REQUIERE_FICHA";
export const PACIENTE_XOR_REQUIRED = "PACIENTE_XOR_REQUIRED";
export const TRANSICION_ESTADO_INVALIDA = "TRANSICION_ESTADO_INVALIDA";
export const EXAMEN_NO_ENCONTRADO = "EXAMEN_NO_ENCONTRADO";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ENTITY_TYPE = "presupuestos";

/**
 * Transiciones del pipeline comercial. `Cancelado` y `Cerrado` son terminales.
 * `Aprobado → Cerrado` se ejecuta a través de `convertToOrden`, que crea la
 * `ordenes` con sus líneas snapshot y actualiza el presupuesto en secuencia.
 */
export const TRANSICIONES_ESTADO: Readonly<
  Record<EstadoPresupuesto, readonly EstadoPresupuesto[]>
> = {
  // Desde Borrador se admite el shortcut a Aprobado — típico en atención
  // presencial donde el paciente está en la recepción y no hace falta
  // "Enviar" (por email/whatsapp) antes de aprobar.
  Borrador: ["Enviado", "Aprobado", "Cancelado"],
  Enviado: ["Aprobado", "Rechazado", "Cancelado"],
  Aprobado: ["Cerrado", "Cancelado"],
  Rechazado: ["Borrador", "Cancelado"],
  Cancelado: [],
  Cerrado: [],
};

type Numeric = number | string;

export interface PresupuestoFilters {
  paciente_id?: string;
  estado?: EstadoPresupuesto;
  estados?: EstadoPresupuesto[];
  desde?: Date | string;
  hasta?: Date | string;
}

export interface PresupuestoLinea {
  id: string;
  presupuesto_id: string;
  examen_id: string;
  paquete_id: string | null;
  nombre_snap: string;
  precio_snap: number;
  precio_base_snap: number;
  ganancia_pct: number;
  precio_final_snap: number;
  orden: number;
}

export interface Presupuesto {
  id: string;
  numero_correlativo: number;
  paciente_id: string | null;
  paciente_nombre_libre: string | null;
  paciente_nombre: string | null;
  paciente_apellido: string | null;
  descuento_pct: number;
  ganancia_pct: number;
  tasa_bs: number;
  /** Cargo por toma de muestra, en USD. Fuera del descuento y la ganancia. */
  toma_muestra_usd: number;
  /** Cargo por servicio a domicilio, en USD. 0 si no aplica. */
  domicilio_usd: number;
  total_usd: number;
  total_bs: number;
  estado: EstadoPresupuesto;
  orden_id: string | null;
  created_at: string;
  created_by: string;
  lineas: PresupuestoLinea[];
}

export interface ListResult {
  items: Presupuesto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PresupuestoConversionResult {
  orden_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function numberOf(value: Numeric): number {
  return typeof value === "number" ? value : Number(value);
}

function validationError(error: unknown): Error {
  const issue = (error as { issues?: Array<{ message?: string }> })?.issues?.[0];
  return new Error(issue?.message ?? "VALIDACION_FALLIDA");
}

function normalizePagination(
  page?: number,
  limit?: number,
): { page: number; limit: number } {
  return {
    page: Math.max(1, Math.trunc(page ?? DEFAULT_PAGE)),
    limit: Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT))),
  };
}

const PRESUPUESTO_COLS =
  "id, numero_correlativo, paciente_id, paciente_nombre_libre, " +
  "descuento_pct, ganancia_pct, tasa_bs, toma_muestra_usd, domicilio_usd, " +
  "total_usd, total_bs, estado, " +
  "orden_id, created_at, created_by, pacientes ( nombre, apellido )";

type PresupuestoRow = {
  id: string;
  numero_correlativo: number;
  paciente_id: string | null;
  paciente_nombre_libre: string | null;
  descuento_pct: Numeric;
  ganancia_pct: Numeric;
  tasa_bs: Numeric;
  toma_muestra_usd: Numeric;
  domicilio_usd: Numeric;
  total_usd: Numeric;
  total_bs: Numeric;
  estado: EstadoPresupuesto;
  orden_id: string | null;
  created_at: string;
  created_by: string;
  pacientes?: { nombre?: string; apellido?: string } | null;
};

type LineaRow = {
  id: string;
  presupuesto_id: string;
  examen_id: string;
  paquete_id: string | null;
  nombre_snap: string;
  precio_snap: Numeric;
  precio_base_snap: Numeric;
  ganancia_pct: Numeric;
  precio_final_snap: Numeric;
  orden: number;
};

function mapHeader(row: PresupuestoRow): Omit<Presupuesto, "lineas"> {
  return {
    id: row.id,
    numero_correlativo: row.numero_correlativo,
    paciente_id: row.paciente_id,
    paciente_nombre_libre: row.paciente_nombre_libre,
    paciente_nombre: row.pacientes?.nombre ?? null,
    paciente_apellido: row.pacientes?.apellido ?? null,
    descuento_pct: numberOf(row.descuento_pct),
    ganancia_pct: numberOf(row.ganancia_pct),
    tasa_bs: numberOf(row.tasa_bs),
    toma_muestra_usd: numberOf(row.toma_muestra_usd),
    domicilio_usd: numberOf(row.domicilio_usd),
    total_usd: numberOf(row.total_usd),
    total_bs: numberOf(row.total_bs),
    estado: row.estado,
    orden_id: row.orden_id,
    created_at: row.created_at,
    created_by: row.created_by,
  };
}

function mapLinea(row: LineaRow): PresupuestoLinea {
  return {
    id: row.id,
    presupuesto_id: row.presupuesto_id,
    examen_id: row.examen_id,
    paquete_id: row.paquete_id,
    nombre_snap: row.nombre_snap,
    precio_snap: numberOf(row.precio_snap),
    precio_base_snap: numberOf(row.precio_base_snap),
    ganancia_pct: numberOf(row.ganancia_pct),
    precio_final_snap: numberOf(row.precio_final_snap),
    orden: row.orden,
  };
}

async function hydrate(
  db: Db,
  rows: PresupuestoRow[],
): Promise<Presupuesto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: lineas, error } = await db
    .from("presupuestos_examenes")
    .select(
      "id, presupuesto_id, examen_id, paquete_id, nombre_snap, precio_snap, precio_base_snap, ganancia_pct, precio_final_snap, orden",
    )
    .in("presupuesto_id", ids)
    .order("orden", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`presupuestos.hydrate: ${error.message}`);

  const byId = new Map<string, PresupuestoLinea[]>();
  for (const raw of (lineas ?? []) as LineaRow[]) {
    const list = byId.get(raw.presupuesto_id) ?? [];
    list.push(mapLinea(raw));
    byId.set(raw.presupuesto_id, list);
  }
  return rows.map((r) => ({ ...mapHeader(r), lineas: byId.get(r.id) ?? [] }));
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

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function list(
  db: Db,
  input: {
    page?: number;
    limit?: number;
    filters?: PresupuestoFilters;
  } = {},
): Promise<ListResult> {
  const { page, limit } = normalizePagination(input.page, input.limit);
  const filters = input.filters ?? {};

  type Filtrable<T> = {
    eq: (column: string, value: unknown) => T;
    in: (column: string, values: readonly unknown[]) => T;
    gte: (column: string, value: unknown) => T;
    lte: (column: string, value: unknown) => T;
  };
  const applyFilters = <T extends Filtrable<T>>(q: T): T => {
    let out = q;
    if (filters.paciente_id) out = out.eq("paciente_id", filters.paciente_id);
    if (filters.estados && filters.estados.length > 0) {
      out = out.in("estado", filters.estados);
    } else if (filters.estado) {
      out = out.eq("estado", filters.estado);
    }
    if (filters.desde)
      out = out.gte(
        "created_at",
        filters.desde instanceof Date ? filters.desde.toISOString() : filters.desde,
      );
    if (filters.hasta)
      out = out.lte(
        "created_at",
        filters.hasta instanceof Date ? filters.hasta.toISOString() : filters.hasta,
      );
    return out;
  };

  const countBase = db.from("presupuestos").select("id", { count: "exact", head: true });
  const countRes = await applyFilters(countBase);
  if (countRes.error) throw new Error(`presupuestos.list count: ${countRes.error.message}`);

  const listBase = db
    .from("presupuestos")
    .select(PRESUPUESTO_COLS)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  const listRes = await applyFilters(listBase);
  if (listRes.error) throw new Error(`presupuestos.list: ${listRes.error.message}`);

  const total = countRes.count ?? 0;
  return {
    items: await hydrate(db, ((listRes.data ?? []) as unknown) as PresupuestoRow[]),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getById(db: Db, id: string): Promise<Presupuesto | null> {
  const { data, error } = await db
    .from("presupuestos")
    .select(PRESUPUESTO_COLS)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(`presupuestos.getById: ${error.message}`);
  const items = await hydrate(db, ((data ?? []) as unknown) as PresupuestoRow[]);
  return items[0] ?? null;
}

export async function getForPDF(db: Db, id: string): Promise<Presupuesto | null> {
  return getById(db, id);
}

export async function search(
  db: Db,
  input: { term: string },
): Promise<Presupuesto[]> {
  const term = input.term.trim();
  const pattern = `%${term}%`;
  // OR compuesto sobre columnas propias (id::text por conveniencia via
  // `id.ilike` no funciona en uuid; usamos filtro sobre paciente_nombre_libre
  // y join con pacientes vía dos queries para no complicar el OR con relaciones).
  const [selfRes, pacRes] = await Promise.all([
    db
      .from("presupuestos")
      .select(PRESUPUESTO_COLS)
      .or(`paciente_nombre_libre.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("pacientes")
      .select("id")
      .or(`nombre.ilike.${pattern},apellido.ilike.${pattern}`),
  ]);
  if (selfRes.error) throw new Error(`presupuestos.search: ${selfRes.error.message}`);
  if (pacRes.error) throw new Error(`presupuestos.search: ${pacRes.error.message}`);

  const pacIds = ((pacRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);
  let byPaciente: PresupuestoRow[] = [];
  if (pacIds.length > 0) {
    const r = await db
      .from("presupuestos")
      .select(PRESUPUESTO_COLS)
      .in("paciente_id", pacIds)
      .order("created_at", { ascending: false })
      .limit(20);
    if (r.error) throw new Error(`presupuestos.search: ${r.error.message}`);
    byPaciente = ((r.data ?? []) as unknown) as PresupuestoRow[];
  }

  const seen = new Set<string>();
  const merged: PresupuestoRow[] = [];
  for (const row of [...(((selfRes.data ?? []) as unknown) as PresupuestoRow[]), ...byPaciente]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return hydrate(db, merged.slice(0, 20));
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

export async function create(
  db: Db,
  input: unknown,
  createdBy?: string,
): Promise<Presupuesto> {
  const parsed = presupuestoCreateSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const raw = input as Record<string, unknown>;
  const actor =
    createdBy ?? (typeof raw.created_by === "string" ? raw.created_by : undefined);
  if (!actor) throw new Error("CREATED_BY_REQUERIDO");

  const examIds = parsed.data.examenes.map((linea) => linea.examen_id);
  const examsRes = await db
    .from("examenes")
    .select("id, nombre, precio_usd")
    .in("id", examIds)
    .eq("activo", true);
  if (examsRes.error) throw new Error(`presupuestos.create: ${examsRes.error.message}`);
  const exams = (examsRes.data ?? []) as Array<{
    id: string;
    nombre: string;
    precio_usd: Numeric;
  }>;
  if (exams.length !== examIds.length) throw new Error(EXAMEN_NO_ENCONTRADO);
  const examById = new Map(exams.map((e) => [e.id, e]));

  const lineasInput = parsed.data.examenes.map((linea) => {
    const exam = examById.get(linea.examen_id)!;
    return {
      linea,
      nombreSnap: exam.nombre,
      precioSnap: numberOf(exam.precio_usd),
      precioBase: linea.precio_base_snap ?? numberOf(exam.precio_usd),
      gananciaEfectiva: linea.ganancia_pct ?? parsed.data.ganancia_pct,
    };
  });

  const tomaMuestraUsd = parsed.data.toma_muestra_usd ?? 0;
  const domicilioUsd = parsed.data.domicilio_usd ?? 0;

  const totals = calcularTotales({
    descuentoPct: parsed.data.descuento_pct,
    gananciaPct: parsed.data.ganancia_pct,
    tasa: parsed.data.tasa_bs,
    serviciosUsd: tomaMuestraUsd + domicilioUsd,
    lineas: lineasInput.map((item) => ({
      precioBase: item.precioBase,
      gananciaPct: item.gananciaEfectiva,
    })),
  });

  const insRes = await db
    .from("presupuestos")
    .insert({
      paciente_id: parsed.data.paciente_id ?? null,
      paciente_nombre_libre: parsed.data.paciente_nombre_libre ?? null,
      descuento_pct: parsed.data.descuento_pct,
      ganancia_pct: parsed.data.ganancia_pct,
      tasa_bs: parsed.data.tasa_bs,
      toma_muestra_usd: tomaMuestraUsd,
      domicilio_usd: domicilioUsd,
      total_usd: totals.totalUsd,
      total_bs: totals.totalBs,
      estado: "Borrador",
      created_by: actor,
    })
    .select("id")
    .limit(1);
  if (insRes.error) throw new Error(`presupuestos.create: ${insRes.error.message}`);
  const id = (insRes.data?.[0] as { id: string } | undefined)?.id;
  if (!id) throw new Error("presupuestos.create: sin id retornado");

  const lineasPayload = lineasInput.map((item, orden) => ({
    presupuesto_id: id,
    examen_id: item.linea.examen_id,
    paquete_id: item.linea.paquete_id ?? null,
    nombre_snap: item.nombreSnap,
    precio_snap: item.precioSnap,
    precio_base_snap: item.precioBase,
    ganancia_pct: item.gananciaEfectiva,
    precio_final_snap: totals.lineas![orden]!.precioFinal,
    orden,
  }));
  const lineasRes = await db.from("presupuestos_examenes").insert(lineasPayload);
  if (lineasRes.error) throw new Error(`presupuestos.create lineas: ${lineasRes.error.message}`);

  await auditBestEffort(db, {
    usuarioId: actor,
    accion: "presupuestos.create",
    entityId: id,
    metadata: { total_usd: totals.totalUsd, total_bs: totals.totalBs },
  });

  const created = await getById(db, id);
  if (!created) throw new Error(PRESUPUESTO_NO_ENCONTRADO);
  return created;
}

export async function update(
  db: Db,
  id: string,
  input: unknown,
  updatedBy?: string,
): Promise<Presupuesto> {
  const parsed = presupuestoUpdateSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const data = parsed.data;

  const existing = await getById(db, id);
  if (!existing) throw new Error(PRESUPUESTO_NO_ENCONTRADO);
  if (existing.estado !== "Borrador") throw new Error(PRESUPUESTO_NO_BORRADOR);
  if (data.estado !== undefined) throw new Error("ESTADO_SOLO_UPDATE_ESTADO");

  const pacienteId =
    data.paciente_id !== undefined ? data.paciente_id : existing.paciente_id;
  const nombreLibre =
    data.paciente_nombre_libre !== undefined
      ? data.paciente_nombre_libre
      : existing.paciente_nombre_libre;
  if ((pacienteId == null) === (nombreLibre == null)) {
    throw new Error(PACIENTE_XOR_REQUIRED);
  }

  let totalUsd = existing.total_usd;
  let totalBs = existing.total_bs;
  const examenes = data.examenes;

  const tomaMuestraUsd = data.toma_muestra_usd ?? existing.toma_muestra_usd;
  const domicilioUsd = data.domicilio_usd ?? existing.domicilio_usd;
  const serviciosUsd = tomaMuestraUsd + domicilioUsd;

  if (examenes) {
    const ids = examenes.map((linea) => linea.examen_id);
    const examsRes = await db
      .from("examenes")
      .select("id, nombre, precio_usd")
      .in("id", ids)
      .eq("activo", true);
    if (examsRes.error) throw new Error(`presupuestos.update: ${examsRes.error.message}`);
    const exams = (examsRes.data ?? []) as Array<{
      id: string;
      nombre: string;
      precio_usd: Numeric;
    }>;
    if (exams.length !== ids.length) throw new Error(EXAMEN_NO_ENCONTRADO);
    const byId = new Map(exams.map((exam) => [exam.id, exam]));

    const descuentoPct = data.descuento_pct ?? existing.descuento_pct;
    const gananciaGlobal = data.ganancia_pct ?? existing.ganancia_pct;
    const tasaBs = data.tasa_bs ?? existing.tasa_bs;

    const lineasInput = examenes.map((linea) => {
      const exam = byId.get(linea.examen_id)!;
      return {
        linea,
        nombreSnap: exam.nombre,
        precioSnap: numberOf(exam.precio_usd),
        precioBase: linea.precio_base_snap ?? numberOf(exam.precio_usd),
        gananciaEfectiva: linea.ganancia_pct ?? gananciaGlobal,
      };
    });
    const totals = calcularTotales({
      descuentoPct,
      gananciaPct: gananciaGlobal,
      tasa: tasaBs,
      serviciosUsd,
      lineas: lineasInput.map((item) => ({
        precioBase: item.precioBase,
        gananciaPct: item.gananciaEfectiva,
      })),
    });
    totalUsd = totals.totalUsd;
    totalBs = totals.totalBs;

    const delRes = await db
      .from("presupuestos_examenes")
      .delete()
      .eq("presupuesto_id", id);
    if (delRes.error) throw new Error(`presupuestos.update: ${delRes.error.message}`);

    const payload = lineasInput.map((item, orden) => ({
      presupuesto_id: id,
      examen_id: item.linea.examen_id,
      paquete_id: item.linea.paquete_id ?? null,
      nombre_snap: item.nombreSnap,
      precio_snap: item.precioSnap,
      precio_base_snap: item.precioBase,
      ganancia_pct: item.gananciaEfectiva,
      precio_final_snap: totals.lineas![orden]!.precioFinal,
      orden,
    }));
    if (payload.length > 0) {
      const insLineas = await db.from("presupuestos_examenes").insert(payload);
      if (insLineas.error) throw new Error(`presupuestos.update: ${insLineas.error.message}`);
    }
  } else if (
    data.descuento_pct !== undefined ||
    data.ganancia_pct !== undefined ||
    data.tasa_bs !== undefined ||
    data.toma_muestra_usd !== undefined ||
    data.domicilio_usd !== undefined
  ) {
    const descuentoPct = data.descuento_pct ?? existing.descuento_pct;
    const gananciaGlobal = data.ganancia_pct;
    const gananciaPct = gananciaGlobal ?? existing.ganancia_pct;
    const tasaBs = data.tasa_bs ?? existing.tasa_bs;

    const totals = calcularTotales({
      descuentoPct,
      gananciaPct,
      tasa: tasaBs,
      serviciosUsd,
      lineas: existing.lineas.map((line) => ({
        precioBase: line.precio_base_snap,
        ...(gananciaGlobal === undefined ? { gananciaPct: line.ganancia_pct } : {}),
      })),
    });
    totalUsd = totals.totalUsd;
    totalBs = totals.totalBs;

    for (const [index, line] of existing.lineas.entries()) {
      const patch = {
        ganancia_pct: gananciaGlobal === undefined ? line.ganancia_pct : gananciaGlobal,
        precio_final_snap: totals.lineas![index]!.precioFinal,
      };
      const upd = await db
        .from("presupuestos_examenes")
        .update(patch)
        .eq("id", line.id);
      if (upd.error) throw new Error(`presupuestos.update: ${upd.error.message}`);
    }
  }

  const headerPatch = {
    paciente_id: pacienteId ?? null,
    paciente_nombre_libre: nombreLibre ?? null,
    descuento_pct: data.descuento_pct ?? existing.descuento_pct,
    ganancia_pct: data.ganancia_pct ?? existing.ganancia_pct,
    tasa_bs: data.tasa_bs ?? existing.tasa_bs,
    toma_muestra_usd: tomaMuestraUsd,
    domicilio_usd: domicilioUsd,
    total_usd: totalUsd,
    total_bs: totalBs,
  };
  const upd = await db.from("presupuestos").update(headerPatch).eq("id", id);
  if (upd.error) throw new Error(`presupuestos.update: ${upd.error.message}`);

  await auditBestEffort(db, {
    usuarioId: updatedBy ?? null,
    accion: "presupuestos.update",
    entityId: id,
    metadata: data as Record<string, unknown>,
  });

  const updated = await getById(db, id);
  if (!updated) throw new Error(PRESUPUESTO_NO_ENCONTRADO);
  return updated;
}

export async function cambiarEstado(
  db: Db,
  id: string,
  nuevoEstado: unknown,
  motivoRechazo?: string,
  userId?: string,
): Promise<Presupuesto> {
  const parsed = presupuestoCambiarEstadoSchema.safeParse({
    estado: nuevoEstado,
    motivo_rechazo: motivoRechazo,
  });
  if (!parsed.success) throw validationError(parsed.error);
  const estado = parsed.data.estado;
  const motivo = parsed.data.motivo_rechazo ?? null;

  const currentRes = await db
    .from("presupuestos")
    .select("id, estado")
    .eq("id", id)
    .limit(1);
  if (currentRes.error) throw new Error(`presupuestos.cambiarEstado: ${currentRes.error.message}`);
  const current = currentRes.data?.[0] as
    | { id: string; estado: EstadoPresupuesto }
    | undefined;
  if (!current) throw new Error(PRESUPUESTO_NO_ENCONTRADO);

  const permitidos = TRANSICIONES_ESTADO[current.estado];
  if (!permitidos.includes(estado)) {
    throw new Error(TRANSICION_ESTADO_INVALIDA);
  }

  const patchRes = await db
    .from("presupuestos")
    .update({
      estado,
      motivo_rechazo: estado === "Rechazado" ? motivo : null,
      fecha_estado: new Date().toISOString(),
    })
    .eq("id", id);
  if (patchRes.error) throw new Error(`presupuestos.cambiarEstado: ${patchRes.error.message}`);

  await auditBestEffort(db, {
    usuarioId: userId ?? null,
    accion: "presupuestos.update_estado",
    entityId: id,
    metadata: {
      estado_anterior: current.estado,
      estado,
      motivo_rechazo: motivo,
    },
  });

  const updated = await getById(db, id);
  if (!updated) throw new Error(PRESUPUESTO_NO_ENCONTRADO);
  return updated;
}

/**
 * Convierte un presupuesto Aprobado en una orden de laboratorio.
 *
 * Reglas:
 *  - Presupuesto debe estar en 'Aprobado'.
 *  - Paciente OBLIGATORIO (rechaza si es libre — la UI debe ofrecer asignar
 *    ficha antes de convertir, ver PACIENTE_LIBRE_REQUIERE_FICHA).
 *  - Si el presupuesto ya tiene `orden_id`, retorna esa (idempotente).
 *  - Crea la orden en estado 'Registrada' + copia las líneas snapshot.
 *  - Cambia el presupuesto a 'Cerrado' con `orden_id` apuntando a la nueva.
 *
 * Sin transacción distribuida: si falla a mitad, el paso siguiente falla
 * "clean" y se puede reintentar; el chequeo de `orden_id` al inicio hace la
 * operación idempotente.
 */
export interface ConvertToOrdenOptions {
  /**
   * Ficha del paciente a asignar en el mismo call. Se usa cuando el presupuesto
   * arrastraba `paciente_nombre_libre` y el operador confirmó la ficha real al
   * momento de convertir (modal de la UI). Si el presupuesto ya tiene
   * `paciente_id`, este parámetro se ignora.
   */
  assignPacienteId?: string;
}

export async function convertToOrden(
  db: Db,
  id: string,
  convertedBy?: string,
  opts: ConvertToOrdenOptions = {},
): Promise<PresupuestoConversionResult> {
  const currentRes = await db
    .from("presupuestos")
    .select("id, paciente_id, estado, orden_id, created_by")
    .eq("id", id)
    .limit(1);
  if (currentRes.error) throw new Error(`presupuestos.convert: ${currentRes.error.message}`);
  const presupuesto = currentRes.data?.[0] as
    | {
        id: string;
        paciente_id: string | null;
        estado: EstadoPresupuesto;
        orden_id: string | null;
        created_by: string;
      }
    | undefined;
  if (!presupuesto) throw new Error(PRESUPUESTO_NO_ENCONTRADO);

  if (presupuesto.orden_id) {
    return { orden_id: presupuesto.orden_id };
  }
  if (presupuesto.estado !== "Aprobado") {
    throw new Error(PRESUPUESTO_NO_APROBADO);
  }

  // Presupuesto libre + operador nos pasa un paciente_id → vincular ahora
  // (el nombre libre se limpia, la ficha manda).
  let pacienteId = presupuesto.paciente_id;
  if (!pacienteId && opts.assignPacienteId) {
    const pacRes = await db
      .from("pacientes")
      .select("id")
      .eq("id", opts.assignPacienteId)
      .eq("activo", true)
      .limit(1);
    if (pacRes.error) throw new Error(`presupuestos.convert paciente: ${pacRes.error.message}`);
    if (!pacRes.data?.[0]) throw new Error("PACIENTE_NO_ENCONTRADO");

    const upd = await db
      .from("presupuestos")
      .update({
        paciente_id: opts.assignPacienteId,
        paciente_nombre_libre: null,
      })
      .eq("id", id);
    if (upd.error) throw new Error(`presupuestos.convert asignar: ${upd.error.message}`);
    pacienteId = opts.assignPacienteId;
  }

  if (!pacienteId) {
    throw new Error(PACIENTE_LIBRE_REQUIERE_FICHA);
  }

  const presupuestoConPaciente = { ...presupuesto, paciente_id: pacienteId };
  const actor = convertedBy ?? presupuestoConPaciente.created_by;

  const ordenRes = await db
    .from("ordenes")
    .insert({
      paciente_id: pacienteId,
      fecha_muestra: new Date().toISOString(),
      estado: "Registrada",
      origen_presupuesto_id: id,
      created_by: actor,
    })
    .select("id")
    .limit(1);
  if (ordenRes.error) throw new Error(`presupuestos.convert orden: ${ordenRes.error.message}`);
  const ordenId = (ordenRes.data?.[0] as { id: string } | undefined)?.id;
  if (!ordenId) throw new Error("presupuestos.convert: sin orden id");

  // Copiar líneas del presupuesto → ordenes_examenes (con datos vigentes del
  // examen para unidad/valores/tipo/método).
  //
  // `toma_muestra_usd` y `domicilio_usd` NO se copian: son cargos del
  // presupuesto, no exámenes, y la orden no los necesita. Al vivir como
  // columnas del encabezado quedan afuera solos, sin filtro explícito.
  const linesRes = await db
    .from("presupuestos_examenes")
    .select("examen_id, nombre_snap, precio_snap, orden")
    .eq("presupuesto_id", id)
    .order("orden", { ascending: true });
  if (linesRes.error) throw new Error(`presupuestos.convert lineas: ${linesRes.error.message}`);
  const lines = (linesRes.data ?? []) as Array<{
    examen_id: string;
    nombre_snap: string;
    precio_snap: Numeric;
    orden: number;
  }>;

  if (lines.length > 0) {
    const examIds = lines.map((l) => l.examen_id);
    const examsRes = await db
      .from("examenes")
      .select("id, unidad, valores_referencia, tipo_analisis, metodo")
      .in("id", examIds)
      .eq("activo", true);
    if (examsRes.error) throw new Error(`presupuestos.convert exams: ${examsRes.error.message}`);
    const byId = new Map(
      ((examsRes.data ?? []) as Array<{
        id: string;
        unidad: string | null;
        valores_referencia: string | null;
        tipo_analisis: string | null;
        metodo: string | null;
      }>).map((e) => [e.id, e]),
    );

    const payload = lines
      .filter((l) => byId.has(l.examen_id))
      .map((l) => {
        const e = byId.get(l.examen_id)!;
        return {
          orden_id: ordenId,
          examen_id: l.examen_id,
          nombre_snap: l.nombre_snap,
          precio_snap: l.precio_snap,
          unidad_snap: e.unidad,
          valores_referencia_snap: e.valores_referencia,
          tipo_analisis_snap: e.tipo_analisis,
          metodo_snap: e.metodo,
          valor: "",
          observacion: null,
          orden: l.orden,
        };
      });

    if (payload.length > 0) {
      const insLineas = await db.from("ordenes_examenes").insert(payload);
      if (insLineas.error) {
        throw new Error(`presupuestos.convert insert lineas: ${insLineas.error.message}`);
      }
    }
  }

  const upd = await db
    .from("presupuestos")
    .update({ estado: "Cerrado", orden_id: ordenId })
    .eq("id", id);
  if (upd.error) throw new Error(`presupuestos.convert update: ${upd.error.message}`);

  await auditBestEffort(db, {
    usuarioId: actor,
    accion: "presupuestos.convert_to_orden",
    entityId: id,
    metadata: { orden_id: ordenId },
  });

  return { orden_id: ordenId };
}

/**
 * @deprecated Renombrado a `convertToOrden`. Se mantiene el nombre viejo para
 * compatibilidad — nuevas features deberían llamar a `convertToOrden`.
 */
export const presupuestosConvertToResultado = convertToOrden;

export async function remove(
  db: Db,
  id: string,
  deletedBy?: string,
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("presupuestos")
    .delete()
    .eq("id", id)
    .select("id")
    .limit(1);
  if (error) throw new Error(`presupuestos.remove: ${error.message}`);
  const row = data?.[0] as { id: string } | undefined;
  if (!row) throw new Error(PRESUPUESTO_NO_ENCONTRADO);

  await auditBestEffort(db, {
    usuarioId: deletedBy ?? null,
    accion: "presupuestos.delete",
    entityId: id,
    metadata: {},
  });

  return row;
}

export { remove as delete };
