import { getSql, withTransaction } from "../client";

import { calcularEdad } from "@labo/lib/edad";
import {
  CEDULA_INVALIDA,
  pacienteSearch,
  pacienteCreate,
  pacienteUpdate,
} from "@labo/lib/schemas/paciente";
import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";
import type { EstadoResultado } from "@labo/lib/schemas/resultado";

export const CEDULA_DUPLICADA = "CEDULA_DUPLICADA";
export const PACIENTE_TIENE_HISTORIAL = "PACIENTE_TIENE_HISTORIAL";
export const PACIENTE_NO_ENCONTRADO = "PACIENTE_NO_ENCONTRADO";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SEARCH_LIMIT = 10;
const DEFAULT_HISTORIAL_LIMIT = 10;
const MAX_HISTORIAL_LIMIT = 100;
const CEDULA_UNIQUE_CONSTRAINT = "pacientes_cedula_unique";

type PgErrorLike = {
  code?: string;
  constraint?: string;
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

interface ResultadoHistorialRow {
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
}

interface ResultadoHistorialLineaRow {
  id: string;
  resultado_id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: number | string;
  unidad_snap: string | null;
  valores_referencia_snap: string | null;
  valor: string;
  observacion: string | null;
  orden: number;
}

interface PresupuestoHistorialRow {
  id: string;
  paciente_id: string | null;
  paciente_nombre_libre: string | null;
  paciente_nombre: string | null;
  paciente_apellido: string | null;
  descuento_pct: number | string;
  ganancia_pct: number | string;
  tasa_bs: number | string;
  total_usd: number | string;
  total_bs: number | string;
  estado: EstadoPresupuesto;
  resultado_id: string | null;
  created_at: Date;
  created_by: string;
}

interface PresupuestoHistorialLineaRow {
  id: string;
  presupuesto_id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: number | string;
  orden: number;
}

export interface PacientesSearchInput {
  term: string;
}

function isPgError(error: unknown): error is PgErrorLike {
  return typeof error === "object" && error !== null;
}

function numberOf(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function normalizeHistorialLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_HISTORIAL_LIMIT;
  return Math.min(MAX_HISTORIAL_LIMIT, Math.max(1, Math.trunc(limit as number)));
}

function mapPacienteWithEdad(paciente: Paciente): PacienteWithEdad {
  return {
    ...paciente,
    edad: calcularEdad(paciente.fecha_nacimiento),
  };
}

function mapResultadoHistorialLinea(
  row: ResultadoHistorialLineaRow,
): PacienteHistorialResultadoLinea {
  return {
    ...row,
    precio_snap: numberOf(row.precio_snap),
  };
}

function mapPresupuestoHistorial(
  row: PresupuestoHistorialRow,
  lineas: PacienteHistorialPresupuestoLinea[],
): PacienteHistorialPresupuesto {
  return {
    ...row,
    descuento_pct: numberOf(row.descuento_pct),
    ganancia_pct: numberOf(row.ganancia_pct),
    tasa_bs: numberOf(row.tasa_bs),
    total_usd: numberOf(row.total_usd),
    total_bs: numberOf(row.total_bs),
    lineas,
  };
}

function mapPresupuestoHistorialLinea(
  row: PresupuestoHistorialLineaRow,
): PacienteHistorialPresupuestoLinea {
  return {
    ...row,
    precio_snap: numberOf(row.precio_snap),
  };
}

async function fetchResultadosHistorial(
  pacienteId: string,
  limit: number,
): Promise<PacienteHistorialResultado[]> {
  const sql = getSql();
  const rows = await sql<ResultadoHistorialRow[]>`
    SELECT id, paciente_id, fecha_muestra, fecha_resultado, medico_solicitante,
           estado, observaciones, origen_presupuesto_id, created_at, created_by
    FROM resultados
    WHERE paciente_id = ${pacienteId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const lineas = await sql<ResultadoHistorialLineaRow[]>`
    SELECT id, resultado_id, examen_id, nombre_snap, precio_snap, unidad_snap,
           valores_referencia_snap, valor, observacion, orden
    FROM resultados_examenes
    WHERE resultado_id IN ${sql(ids)}
    ORDER BY orden ASC, id ASC
  `;

  const lineasPorResultado = new Map<string, PacienteHistorialResultadoLinea[]>();
  for (const linea of lineas) {
    const items = lineasPorResultado.get(linea.resultado_id) ?? [];
    items.push(mapResultadoHistorialLinea(linea));
    lineasPorResultado.set(linea.resultado_id, items);
  }

  return rows.map((row) => ({
    ...row,
    examenes: lineasPorResultado.get(row.id) ?? [],
  }));
}

async function fetchPresupuestosHistorial(
  pacienteId: string,
  limit: number,
): Promise<PacienteHistorialPresupuesto[]> {
  const sql = getSql();
  const rows = await sql<PresupuestoHistorialRow[]>`
    SELECT p.id, p.paciente_id, p.paciente_nombre_libre,
           pa.nombre AS paciente_nombre, pa.apellido AS paciente_apellido,
           p.descuento_pct, p.ganancia_pct, p.tasa_bs, p.total_usd, p.total_bs,
           p.estado, p.resultado_id, p.created_at, p.created_by
    FROM presupuestos p
    LEFT JOIN pacientes pa ON pa.id = p.paciente_id
    WHERE p.paciente_id = ${pacienteId}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const lineas = await sql<PresupuestoHistorialLineaRow[]>`
    SELECT id, presupuesto_id, examen_id, nombre_snap, precio_snap, orden
    FROM presupuestos_examenes
    WHERE presupuesto_id IN ${sql(ids)}
    ORDER BY orden ASC, id ASC
  `;

  const lineasPorPresupuesto = new Map<string, PacienteHistorialPresupuestoLinea[]>();
  for (const linea of lineas) {
    const items = lineasPorPresupuesto.get(linea.presupuesto_id) ?? [];
    items.push(mapPresupuestoHistorialLinea(linea));
    lineasPorPresupuesto.set(linea.presupuesto_id, items);
  }

  return rows.map((row) =>
    mapPresupuestoHistorial(row, lineasPorPresupuesto.get(row.id) ?? []),
  );
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

function normalizePagination(
  input: ListPacientesInput,
): Required<ListPacientesInput> {
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

function escapeLikePrefixTerm(raw: string): string {
  return raw.replace(/[\\%_]/g, "\\$&");
}

function mapUniqueCedulaError(error: unknown): never {
  if (
    isPgError(error) &&
    error.code === "23505" &&
    error.constraint === CEDULA_UNIQUE_CONSTRAINT
  ) {
    throw new Error(CEDULA_DUPLICADA);
  }
  throw error;
}

export async function getById(id: string): Promise<Paciente | null> {
  const sql = getSql();
  const rows = await sql<Paciente[]>`
    SELECT id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono, email,
           direccion, activo, created_at, updated_at
    FROM pacientes
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function list(
  input: ListPacientesInput = {},
): Promise<ListPacientesResult> {
  const sql = getSql();
  const { page, limit } = normalizePagination(input);
  const offset = (page - 1) * limit;

  const [items, totalRows] = await Promise.all([
    sql<Paciente[]>`
      SELECT id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono, email,
             direccion, activo, created_at, updated_at
      FROM pacientes
      WHERE activo = true
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM pacientes
      WHERE activo = true
    `,
  ]);

  const total = Number(totalRows[0]?.count ?? 0);

  return {
    items,
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export async function create(input: unknown): Promise<Paciente> {
  const parsed = pacienteCreate.safeParse(coerceInputDates(input));
  if (!parsed.success) {
    throw toDomainValidationError(parsed.error);
  }

  const sql = getSql();
  const payload = mapPacienteCreate(parsed.data as unknown as Record<string, unknown>);

  try {
    const rows = await sql<Paciente[]>`
      INSERT INTO pacientes ${sql(payload)}
      RETURNING id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono,
                email, direccion, activo, created_at, updated_at
    `;
    return rows[0]!;
  } catch (error) {
    mapUniqueCedulaError(error);
  }
}

export async function pacientesSearch(
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

  const sql = getSql();
  const cedulaPrefix = normalizeCedulaPrefixTerm(term);

  if (cedulaPrefix !== null) {
    const cedulaPattern = `${escapeLikePrefixTerm(cedulaPrefix)}%`;

    return sql<PacienteSearchItem[]>`
      SELECT id, nombre, apellido, cedula, fecha_nacimiento
      FROM pacientes
      WHERE activo = true
        AND cedula ILIKE ${cedulaPattern} ESCAPE '\'
      ORDER BY cedula ASC, apellido ASC, nombre ASC
      LIMIT ${SEARCH_LIMIT}
    `;
  }

  const normalizedTerm = term.toLowerCase();
  const termPattern = `${escapeLikePrefixTerm(normalizedTerm)}%`;

  return sql<PacienteSearchItem[]>`
    SELECT id, nombre, apellido, cedula, fecha_nacimiento
    FROM pacientes
    WHERE activo = true
      AND (
        lower(nombre) LIKE ${termPattern} ESCAPE '\'
        OR lower(apellido) LIKE ${termPattern} ESCAPE '\'
        OR lower(concat_ws(' ', nombre, apellido)) LIKE ${termPattern} ESCAPE '\'
      )
    ORDER BY
      CASE
        WHEN lower(concat_ws(' ', nombre, apellido)) LIKE ${termPattern} ESCAPE '\' THEN 0
        WHEN lower(nombre) LIKE ${termPattern} ESCAPE '\' THEN 1
        ELSE 2
      END,
      nombre ASC,
      apellido ASC,
      cedula ASC
    LIMIT ${SEARCH_LIMIT}
  `;
}

export async function pacientesGetWithHistorial(
  input: PacientesGetWithHistorialInput,
): Promise<PacienteWithHistorial> {
  const paciente = await getById(input.id);
  if (!paciente) throw new Error(PACIENTE_NO_ENCONTRADO);

  const resultadosLimit = normalizeHistorialLimit(input.resultadosLimit);
  const presupuestosLimit = normalizeHistorialLimit(input.presupuestosLimit);

  const [resultados, presupuestos] = await Promise.all([
    fetchResultadosHistorial(input.id, resultadosLimit),
    fetchPresupuestosHistorial(input.id, presupuestosLimit),
  ]);

  return {
    paciente: mapPacienteWithEdad(paciente),
    resultados,
    presupuestos,
  };
}

export async function update(id: string, input: unknown): Promise<Paciente> {
  const parsed = pacienteUpdate.safeParse(coerceInputDates(input));
  if (!parsed.success) {
    throw toDomainValidationError(parsed.error);
  }

  const payload = mapPacienteUpdate(parsed.data as unknown as Record<string, unknown>);
  if (Object.keys(payload).length === 0) {
    const existing = await getById(id);
    if (!existing) throw new Error(PACIENTE_NO_ENCONTRADO);
    return existing;
  }

  const sql = getSql();

  try {
    const columns = Object.keys(payload) as Array<keyof typeof payload>;
    const rows = await sql<Paciente[]>`
      UPDATE pacientes
      SET ${sql(payload, ...columns)}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono,
                email, direccion, activo, created_at, updated_at
    `;

    const paciente = rows[0] ?? null;
    if (!paciente) throw new Error(PACIENTE_NO_ENCONTRADO);
    return paciente;
  } catch (error) {
    mapUniqueCedulaError(error);
  }
}

export async function deactivate(id: string): Promise<DeactivatePacienteResult> {
  return withTransaction(async (tx) => {
    const existing = await tx<Paciente[]>`
      SELECT id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono, email,
             direccion, activo, created_at, updated_at
      FROM pacientes
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!existing[0]) {
      throw new Error(PACIENTE_NO_ENCONTRADO);
    }

    const historyRows = await tx<
      { has_resultados: boolean; has_presupuestos: boolean }[]
    >`
      SELECT EXISTS(
        SELECT 1 FROM resultados WHERE paciente_id = ${id}
      ) AS has_resultados,
      EXISTS(
        SELECT 1 FROM presupuestos WHERE paciente_id = ${id}
      ) AS has_presupuestos
    `;

    const hasHistory =
      historyRows[0]?.has_resultados === true ||
      historyRows[0]?.has_presupuestos === true;

    if (hasHistory) {
      const rows = await tx<Paciente[]>`
        UPDATE pacientes
        SET activo = false, updated_at = now()
        WHERE id = ${id}
        RETURNING id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono,
                  email, direccion, activo, created_at, updated_at
      `;
      return {
        paciente: rows[0]!,
        mode: "soft-delete",
      } satisfies DeactivatePacienteResult;
    }

    try {
      const rows = await tx<Paciente[]>`
        DELETE FROM pacientes
        WHERE id = ${id}
        RETURNING id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono,
                  email, direccion, activo, created_at, updated_at
      `;
      return {
        paciente: rows[0]!,
        mode: "hard-delete",
      } satisfies DeactivatePacienteResult;
    } catch (error) {
      if (isPgError(error) && error.code === "23503") {
        const rows = await tx<Paciente[]>`
          UPDATE pacientes
          SET activo = false, updated_at = now()
          WHERE id = ${id}
          RETURNING id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono,
                    email, direccion, activo, created_at, updated_at
        `;
        return {
          paciente: rows[0]!,
          mode: "soft-delete",
        } satisfies DeactivatePacienteResult;
      }
      throw error;
    }
  });
}
