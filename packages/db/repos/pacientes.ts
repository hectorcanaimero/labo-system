import { calcularEdad } from "@labo/lib/edad";
import {
  CEDULA_INVALIDA,
  pacienteSearch,
  pacienteCreate,
  pacienteUpdate,
} from "@labo/lib/schemas/paciente";
import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";
import type { EstadoResultado } from "@labo/lib/schemas/resultado";

import type { Db } from "../sdk";

export const CEDULA_DUPLICADA = "CEDULA_DUPLICADA";
export const PACIENTE_TIENE_HISTORIAL = "PACIENTE_TIENE_HISTORIAL";
export const PACIENTE_NO_ENCONTRADO = "PACIENTE_NO_ENCONTRADO";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SEARCH_LIMIT = 10;
const DEFAULT_HISTORIAL_LIMIT = 10;
const MAX_HISTORIAL_LIMIT = 100;

type PgErrorLike = {
  code?: string;
};

export interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: Date;
  sexo: "M" | "F" | "O" | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ListPacientesInput {
  page?: number;
  limit?: number;
}

export interface ListPacientesResult {
  items: Paciente[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DeactivatePacienteResult {
  paciente: Paciente;
  mode: "hard-delete" | "soft-delete";
}

export interface PacienteSearchItem {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: Date;
}

export interface PacienteWithEdad extends Paciente {
  edad: number;
}

export interface PacienteHistorialResultadoLinea {
  id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: number;
  unidad_snap: string | null;
  valores_referencia_snap: string | null;
  valor: string;
  observacion: string | null;
  orden: number;
}

export interface PacienteHistorialResultado {
  id: string;
  paciente_id: string;
  fecha_muestra: Date;
  fecha_resultado: Date | null;
  medico_solicitante: string | null;
  estado: EstadoResultado;
  observaciones: string | null;
  origen_presupuesto_id: string | null;
  created_at: Date;
  created_by: string;
  examenes: PacienteHistorialResultadoLinea[];
}

export interface PacienteHistorialPresupuestoLinea {
  id: string;
  presupuesto_id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: number;
  orden: number;
}

export interface PacienteHistorialPresupuesto {
  id: string;
  paciente_id: string | null;
  paciente_nombre_libre: string | null;
  paciente_nombre: string | null;
  paciente_apellido: string | null;
  descuento_pct: number;
  ganancia_pct: number;
  tasa_bs: number;
  total_usd: number;
  total_bs: number;
  estado: EstadoPresupuesto;
  resultado_id: string | null;
  created_at: Date;
  created_by: string;
  lineas: PacienteHistorialPresupuestoLinea[];
}

export interface PacientesGetWithHistorialInput {
  id: string;
  resultadosLimit?: number;
  presupuestosLimit?: number;
}

export interface PacienteWithHistorial {
  paciente: PacienteWithEdad;
  resultados: PacienteHistorialResultado[];
  presupuestos: PacienteHistorialPresupuesto[];
}

export interface PacientesSearchInput {
  term: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(value as string | number);
}

function numberOf(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function isPgError(error: unknown): error is PgErrorLike {
  return typeof error === "object" && error !== null;
}

function mapPaciente(row: Record<string, unknown>): Paciente {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    apellido: row.apellido as string,
    cedula: row.cedula as string,
    fecha_nacimiento: toDate(row.fecha_nacimiento),
    sexo: (row.sexo as "M" | "F" | "O" | null) ?? null,
    telefono: (row.telefono as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    direccion: (row.direccion as string | null) ?? null,
    activo: row.activo as boolean,
    created_at: toDate(row.created_at),
    updated_at: toDate(row.updated_at),
  };
}

function mapPacienteWithEdad(paciente: Paciente): PacienteWithEdad {
  return {
    ...paciente,
    edad: calcularEdad(paciente.fecha_nacimiento),
  };
}

function normalizeHistorialLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_HISTORIAL_LIMIT;
  return Math.min(MAX_HISTORIAL_LIMIT, Math.max(1, Math.trunc(limit as number)));
}

function normalizePagination(input: ListPacientesInput): Required<ListPacientesInput> {
  const page = Number.isFinite(input.page)
    ? Math.trunc(input.page as number)
    : DEFAULT_PAGE;
  const limit = Number.isFinite(input.limit)
    ? Math.trunc(input.limit as number)
    : DEFAULT_LIMIT;

  return {
    page: Math.max(DEFAULT_PAGE, page),
    limit: Math.min(MAX_LIMIT, Math.max(1, limit)),
  };
}

function normalizeCedulaPrefixTerm(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[\s.]/g, "");
  const match = /^([VE])[-]?(\d{1,9})/.exec(cleaned);
  if (!match) return null;

  const [, prefix, digits] = match;
  return `${prefix}-${digits}`;
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
      : "VALIDACION_FALLIDA";

  if (message === CEDULA_INVALIDA || message === "CEDULA_PREFIJO_INVALIDO") {
    return new Error(CEDULA_INVALIDA);
  }

  return new Error(message);
}

function coerceInputDates(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }

  const payload = { ...(input as Record<string, unknown>) };
  const value = payload.fecha_nacimiento;

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      payload.fecha_nacimiento = date;
    }
  }

  return payload;
}

function mapPacienteCreate(input: Record<string, unknown>): Record<string, unknown> {
  return {
    nombre: input.nombre,
    apellido: input.apellido,
    cedula: input.cedula,
    fecha_nacimiento: new Date(input.fecha_nacimiento as number),
    sexo: input.sexo ?? null,
    telefono: typeof input.telefono === "string" ? input.telefono.trim() || null : null,
    email: typeof input.email === "string" ? input.email.trim() || null : null,
    direccion: typeof input.direccion === "string" ? input.direccion.trim() || null : null,
  };
}

function mapPacienteUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.nombre !== undefined) payload.nombre = input.nombre;
  if (input.apellido !== undefined) payload.apellido = input.apellido;
  if (input.cedula !== undefined) payload.cedula = input.cedula;
  if (input.fecha_nacimiento !== undefined) {
    payload.fecha_nacimiento = new Date(input.fecha_nacimiento as number);
  }
  if (input.sexo !== undefined) payload.sexo = input.sexo;
  if (input.telefono !== undefined) {
    payload.telefono =
      typeof input.telefono === "string" ? input.telefono.trim() || null : input.telefono;
  }
  if (input.email !== undefined) {
    payload.email = typeof input.email === "string" ? input.email.trim() || null : input.email;
  }
  if (input.direccion !== undefined) {
    payload.direccion =
      typeof input.direccion === "string" ? input.direccion.trim() || null : input.direccion;
  }

  return payload;
}

function mapUniqueCedulaError(error: unknown): never {
  if (isPgError(error) && error.code === "23505") {
    throw new Error(CEDULA_DUPLICADA);
  }
  throw error as Error;
}

function mapResultadoHistorialLinea(
  row: Record<string, unknown>,
): PacienteHistorialResultadoLinea {
  return {
    id: row.id as string,
    examen_id: row.examen_id as string,
    nombre_snap: row.nombre_snap as string,
    precio_snap: numberOf(row.precio_snap as number | string),
    unidad_snap: (row.unidad_snap as string | null) ?? null,
    valores_referencia_snap: (row.valores_referencia_snap as string | null) ?? null,
    valor: row.valor as string,
    observacion: (row.observacion as string | null) ?? null,
    orden: row.orden as number,
  };
}

function mapResultadoHistorial(row: Record<string, unknown>): PacienteHistorialResultado {
  return {
    id: row.id as string,
    paciente_id: row.paciente_id as string,
    fecha_muestra: toDate(row.fecha_muestra),
    fecha_resultado: row.fecha_resultado ? toDate(row.fecha_resultado) : null,
    medico_solicitante: (row.medico_solicitante as string | null) ?? null,
    estado: row.estado as EstadoResultado,
    observaciones: (row.observaciones as string | null) ?? null,
    origen_presupuesto_id: (row.origen_presupuesto_id as string | null) ?? null,
    created_at: toDate(row.created_at),
    created_by: row.created_by as string,
    examenes: [],
  };
}

function mapPresupuestoHistorialLinea(
  row: Record<string, unknown>,
): PacienteHistorialPresupuestoLinea {
  return {
    id: row.id as string,
    presupuesto_id: row.presupuesto_id as string,
    examen_id: row.examen_id as string,
    nombre_snap: row.nombre_snap as string,
    precio_snap: numberOf(row.precio_snap as number | string),
    orden: row.orden as number,
  };
}

function mapPresupuestoHistorial(
  row: Record<string, unknown>,
  lineas: PacienteHistorialPresupuestoLinea[],
): PacienteHistorialPresupuesto {
  return {
    id: row.id as string,
    paciente_id: (row.paciente_id as string | null) ?? null,
    paciente_nombre_libre: (row.paciente_nombre_libre as string | null) ?? null,
    paciente_nombre: (row.paciente_nombre as string | null) ?? null,
    paciente_apellido: (row.paciente_apellido as string | null) ?? null,
    descuento_pct: numberOf(row.descuento_pct as number | string),
    ganancia_pct: numberOf(row.ganancia_pct as number | string),
    tasa_bs: numberOf(row.tasa_bs as number | string),
    total_usd: numberOf(row.total_usd as number | string),
    total_bs: numberOf(row.total_bs as number | string),
    estado: row.estado as EstadoPresupuesto,
    resultado_id: (row.orden_id as string | null) ?? null,
    created_at: toDate(row.created_at),
    created_by: row.created_by as string,
    lineas,
  };
}

// ── queries ──────────────────────────────────────────────────────────────────

async function fetchResultadosHistorial(
  db: Db,
  pacienteId: string,
  limit: number,
): Promise<PacienteHistorialResultado[]> {
  const { data: rows, error } = await db
    .from("ordenes")
    .select("*")
    .eq("paciente_id", pacienteId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const resultados = (rows ?? []).map(mapResultadoHistorial);
  if (resultados.length === 0) return [];

  const ids = resultados.map((r) => r.id);
  const { data: lineas, error: lineasError } = await db
    .from("ordenes_examenes")
    .select("*")
    .in("orden_id", ids)
    .order("orden", { ascending: true })
    .order("id", { ascending: true });

  if (lineasError) throw lineasError;

  const lineasPorResultado = new Map<string, PacienteHistorialResultadoLinea[]>();
  for (const raw of lineas ?? []) {
    const linea = mapResultadoHistorialLinea(raw as Record<string, unknown>);
    const resultadoId = (raw as Record<string, unknown>).orden_id as string;
    const items = lineasPorResultado.get(resultadoId) ?? [];
    items.push(linea);
    lineasPorResultado.set(resultadoId, items);
  }

  return resultados.map((r) => ({
    ...r,
    examenes: lineasPorResultado.get(r.id) ?? [],
  }));
}

async function fetchPresupuestosHistorial(
  db: Db,
  pacienteId: string,
  limit: number,
): Promise<PacienteHistorialPresupuesto[]> {
  const { data: rows, error } = await db
    .from("presupuestos")
    .select("*")
    .eq("paciente_id", pacienteId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const presupuestos = (rows ?? []).map((r) =>
    mapPresupuestoHistorial(r as Record<string, unknown>, []),
  );
  if (presupuestos.length === 0) return [];

  const ids = presupuestos.map((p) => p.id);
  const { data: lineas, error: lineasError } = await db
    .from("presupuestos_examenes")
    .select("*")
    .in("presupuesto_id", ids)
    .order("orden", { ascending: true })
    .order("id", { ascending: true });

  if (lineasError) throw lineasError;

  const lineasPorPresupuesto = new Map<string, PacienteHistorialPresupuestoLinea[]>();
  for (const raw of lineas ?? []) {
    const linea = mapPresupuestoHistorialLinea(raw as Record<string, unknown>);
    const presupuestoId = (raw as Record<string, unknown>).presupuesto_id as string;
    const items = lineasPorPresupuesto.get(presupuestoId) ?? [];
    items.push(linea);
    lineasPorPresupuesto.set(presupuestoId, items);
  }

  return presupuestos.map((p) => ({
    ...p,
    lineas: lineasPorPresupuesto.get(p.id) ?? [],
  }));
}

// ── exports ──────────────────────────────────────────────────────────────────

export async function getById(db: Db, id: string): Promise<Paciente | null> {
  const { data, error } = await db
    .from("pacientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPaciente(data as Record<string, unknown>) : null;
}

export async function list(
  db: Db,
  input: ListPacientesInput = {},
): Promise<ListPacientesResult> {
  const { page, limit } = normalizePagination(input);
  const offset = (page - 1) * limit;

  const { data, error, count } = await db
    .from("pacientes")
    .select("*", { count: "exact" })
    .eq("activo", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const total = count ?? 0;

  return {
    items: (data ?? []).map((r) => mapPaciente(r as Record<string, unknown>)),
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export async function create(db: Db, input: unknown): Promise<Paciente> {
  const parsed = pacienteCreate.safeParse(coerceInputDates(input));
  if (!parsed.success) {
    throw toDomainValidationError(parsed.error);
  }

  const payload = mapPacienteCreate(parsed.data as unknown as Record<string, unknown>);

  const { data, error } = await db
    .from("pacientes")
    .insert(payload)
    .select()
    .single();

  if (error) mapUniqueCedulaError(error);
  return mapPaciente(data as Record<string, unknown>);
}

export async function pacientesSearch(
  db: Db,
  input: PacientesSearchInput,
): Promise<PacienteSearchItem[]> {
  const parsed = pacienteSearch.safeParse(input);
  if (!parsed.success) {
    throw toDomainValidationError(parsed.error);
  }

  const term = parsed.data.term.trim();
  if (term.length === 0) {
    return [];
  }

  const cedulaPrefix = normalizeCedulaPrefixTerm(term);

  const base = db
    .from("pacientes")
    .select("id, nombre, apellido, cedula, fecha_nacimiento")
    .eq("activo", true);

  if (cedulaPrefix !== null) {
    const { data, error } = await base
      .ilike("cedula", `${cedulaPrefix}%`)
      .order("cedula", { ascending: true })
      .order("apellido", { ascending: true })
      .order("nombre", { ascending: true })
      .limit(SEARCH_LIMIT);

    if (error) throw error;
    return (data ?? []).map((r) => mapSearchItem(r as Record<string, unknown>));
  }

  const lowered = term.toLowerCase();
  const { data, error } = await base
    .or(`nombre.ilike.%${lowered}%,apellido.ilike.%${lowered}%`)
    .order("nombre", { ascending: true })
    .order("apellido", { ascending: true })
    .order("cedula", { ascending: true })
    .limit(SEARCH_LIMIT);

  if (error) throw error;
  return (data ?? []).map((r) => mapSearchItem(r as Record<string, unknown>));
}

function mapSearchItem(row: Record<string, unknown>): PacienteSearchItem {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    apellido: row.apellido as string,
    cedula: row.cedula as string,
    fecha_nacimiento: toDate(row.fecha_nacimiento),
  };
}

export async function pacientesGetWithHistorial(
  db: Db,
  input: PacientesGetWithHistorialInput,
): Promise<PacienteWithHistorial> {
  const paciente = await getById(db, input.id);
  if (!paciente) throw new Error(PACIENTE_NO_ENCONTRADO);

  const resultadosLimit = normalizeHistorialLimit(input.resultadosLimit);
  const presupuestosLimit = normalizeHistorialLimit(input.presupuestosLimit);

  const [resultados, presupuestos] = await Promise.all([
    fetchResultadosHistorial(db, input.id, resultadosLimit),
    fetchPresupuestosHistorial(db, input.id, presupuestosLimit),
  ]);

  return {
    paciente: mapPacienteWithEdad(paciente),
    resultados,
    presupuestos,
  };
}

export async function update(db: Db, id: string, input: unknown): Promise<Paciente> {
  const parsed = pacienteUpdate.safeParse(coerceInputDates(input));
  if (!parsed.success) {
    throw toDomainValidationError(parsed.error);
  }

  const payload = mapPacienteUpdate(parsed.data as unknown as Record<string, unknown>);
  if (Object.keys(payload).length === 0) {
    const existing = await getById(db, id);
    if (!existing) throw new Error(PACIENTE_NO_ENCONTRADO);
    return existing;
  }

  const { data, error } = await db
    .from("pacientes")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) mapUniqueCedulaError(error);
  return mapPaciente(data as Record<string, unknown>);
}

export async function deactivate(
  db: Db,
  id: string,
): Promise<DeactivatePacienteResult> {
  const existing = await getById(db, id);
  if (!existing) throw new Error(PACIENTE_NO_ENCONTRADO);

  const [res, pre] = await Promise.all([
    db.from("ordenes").select("id").eq("paciente_id", id).limit(1),
    db.from("presupuestos").select("id").eq("paciente_id", id).limit(1),
  ]);

  if (res.error) throw res.error;
  if (pre.error) throw pre.error;

  const hasHistory =
    (res.data?.length ?? 0) > 0 || (pre.data?.length ?? 0) > 0;

  if (hasHistory) {
    return softDelete(db, id);
  }

  const { data, error } = await db
    .from("pacientes")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (isPgError(error) && error.code === "23503") {
      return softDelete(db, id);
    }
    throw error;
  }

  return {
    paciente: mapPaciente(data as Record<string, unknown>),
    mode: "hard-delete",
  };
}

async function softDelete(db: Db, id: string): Promise<DeactivatePacienteResult> {
  const { data, error } = await db
    .from("pacientes")
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return {
    paciente: mapPaciente(data as Record<string, unknown>),
    mode: "soft-delete",
  };
}
