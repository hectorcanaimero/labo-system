import { getSql, withTransaction } from "../client";
import type { Sql } from "postgres";
import {
  presupuestoCreateSchema,
  presupuestoUpdateSchema,
  estadoPresupuestoSchema,
  type EstadoPresupuesto,
} from "@labo/lib/schemas/presupuesto";
import { calcularTotales } from "@labo/lib/calcular-totales";

export const PRESUPUESTO_NO_ENCONTRADO = "PRESUPUESTO_NO_ENCONTRADO";
export const PRESUPUESTO_NO_BORRADOR = "PRESUPUESTO_NO_BORRADOR";
export const PRESUPUESTO_NO_APROBADO = "PRESUPUESTO_NO_APROBADO";
export const PACIENTE_LIBRE_REQUIERE_FICHA = "PACIENTE_LIBRE_REQUIERE_FICHA";
export const PACIENTE_XOR_REQUIRED = "PACIENTE_XOR_REQUIRED";
export const RESULTADO_ID_REQUERIDO = "RESULTADO_ID_REQUERIDO";
export const EXAMEN_NO_ENCONTRADO = "EXAMEN_NO_ENCONTRADO";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ENTITY_TYPE = "presupuestos";

type Numeric = number | string;

export interface PresupuestoFilters {
  paciente_id?: string;
  estado?: EstadoPresupuesto;
  desde?: Date | string;
  hasta?: Date | string;
}

export interface PresupuestoLinea {
  id: string;
  presupuesto_id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: number;
  orden: number;
}

export interface Presupuesto {
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
  resultado_id: string;
}

function numberOf(value: Numeric): number {
  return typeof value === "number" ? value : Number(value);
}

function mapHeader(row: Record<string, unknown>): Omit<Presupuesto, "lineas"> {
  return {
    id: String(row.id),
    paciente_id: (row.paciente_id as string | null) ?? null,
    paciente_nombre_libre: (row.paciente_nombre_libre as string | null) ?? null,
    paciente_nombre: (row.paciente_nombre as string | null) ?? null,
    paciente_apellido: (row.paciente_apellido as string | null) ?? null,
    descuento_pct: numberOf(row.descuento_pct as Numeric),
    ganancia_pct: numberOf(row.ganancia_pct as Numeric),
    tasa_bs: numberOf(row.tasa_bs as Numeric),
    total_usd: numberOf(row.total_usd as Numeric),
    total_bs: numberOf(row.total_bs as Numeric),
    estado: row.estado as EstadoPresupuesto,
    resultado_id: (row.resultado_id as string | null) ?? null,
    created_at: row.created_at as Date,
    created_by: String(row.created_by),
  };
}

function mapLinea(row: Record<string, unknown>): PresupuestoLinea {
  return { ...(row as unknown as PresupuestoLinea), precio_snap: numberOf(row.precio_snap as Numeric) };
}

function validationError(error: unknown): Error {
  const issue = (error as { issues?: Array<{ message?: string }> })?.issues?.[0];
  return new Error(issue?.message ?? "VALIDACION_FALLIDA");
}

function normalizePagination(page?: number, limit?: number): { page: number; limit: number } {
  return {
    page: Math.max(1, Math.trunc(page ?? DEFAULT_PAGE)),
    limit: Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT))),
  };
}

const headerSql = (sql: Sql) => sql`
  SELECT p.id, p.paciente_id, p.paciente_nombre_libre,
         pa.nombre AS paciente_nombre, pa.apellido AS paciente_apellido,
         p.descuento_pct, p.ganancia_pct, p.tasa_bs, p.total_usd, p.total_bs,
         p.estado, p.resultado_id, p.created_at, p.created_by
  FROM presupuestos p
  LEFT JOIN pacientes pa ON pa.id = p.paciente_id
`;

async function hydrate(rows: Record<string, unknown>[], query = getSql()): Promise<Presupuesto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => String(row.id));
  const lineas = await query<Record<string, unknown>[]>`
    SELECT id, presupuesto_id, examen_id, nombre_snap, precio_snap, orden
    FROM presupuestos_examenes
    WHERE presupuesto_id IN ${query(ids)}
    ORDER BY orden ASC, id ASC
  `;
  const byId = new Map<string, PresupuestoLinea[]>();
  for (const linea of lineas) {
    const presupuestoId = String(linea.presupuesto_id);
    const list = byId.get(presupuestoId) ?? [];
    list.push(mapLinea(linea));
    byId.set(presupuestoId, list);
  }
  return rows.map((row) => ({ ...mapHeader(row), lineas: byId.get(String(row.id)) ?? [] }));
}

export async function list(input: { page?: number; limit?: number; filters?: PresupuestoFilters } = {}): Promise<ListResult> {
  const sql = getSql();
  const { page, limit } = normalizePagination(input.page, input.limit);
  const filters = input.filters ?? {};
  const conditions = [sql`TRUE`];
  if (filters.paciente_id) conditions.push(sql`p.paciente_id = ${filters.paciente_id}`);
  if (filters.estado) conditions.push(sql`p.estado = ${filters.estado}`);
  if (filters.desde) conditions.push(sql`p.created_at >= ${filters.desde}`);
  if (filters.hasta) conditions.push(sql`p.created_at <= ${filters.hasta}`);
  const where = conditions.reduce((result, condition) => sql`${result} AND ${condition}`);
  const countRows = await sql<{ count: number | string }[]>`SELECT COUNT(*)::int AS count FROM presupuestos p WHERE ${where}`;
  const rows = await sql<Record<string, unknown>[]>`${headerSql(sql)} WHERE ${where} ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
  const total = Number(countRows[0]?.count ?? 0);
  return { items: await hydrate(rows, sql), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getById(id: string): Promise<Presupuesto | null> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`${headerSql(sql)} WHERE p.id = ${id} LIMIT 1`;
  const items = await hydrate(rows, sql);
  return items[0] ?? null;
}

export async function getForPDF(id: string): Promise<Presupuesto | null> {
  return getById(id);
}

export async function presupuestosConvertToResultado(
  id: string,
  convertedBy?: string,
): Promise<PresupuestoConversionResult> {
  return withTransaction(async (tx) => {
    const rows = await tx<{
      id: string;
      paciente_id: string | null;
      estado: EstadoPresupuesto;
      resultado_id: string | null;
      created_by: string;
    }[]>`
      SELECT id, paciente_id, estado, resultado_id, created_by
      FROM presupuestos
      WHERE id = ${id}
      FOR UPDATE
    `;
    const presupuesto = rows[0];
    if (!presupuesto) throw new Error(PRESUPUESTO_NO_ENCONTRADO);

    if (presupuesto.resultado_id) {
      return { resultado_id: presupuesto.resultado_id };
    }
    if (presupuesto.estado !== "Aprobado") {
      throw new Error(PRESUPUESTO_NO_APROBADO);
    }
    if (!presupuesto.paciente_id) {
      throw new Error(PACIENTE_LIBRE_REQUIERE_FICHA);
    }

    const actor = convertedBy ?? presupuesto.created_by;
    const resultados = await tx<{ id: string }[]>`
      INSERT INTO resultados
        (paciente_id, fecha_muestra, estado, origen_presupuesto_id, created_by)
      VALUES
        (${presupuesto.paciente_id}, CURRENT_TIMESTAMP, 'Pendiente', ${id}, ${actor})
      RETURNING id
    `;
    const resultadoId = resultados[0]!.id;

    await tx`
      INSERT INTO resultados_examenes
        (resultado_id, examen_id, nombre_snap, precio_snap, unidad_snap,
         valores_referencia_snap, valor, observacion, orden)
      SELECT ${resultadoId}, pe.examen_id, pe.nombre_snap, pe.precio_snap,
             e.unidad, e.valores_referencia, '', NULL, pe.orden
      FROM presupuestos_examenes pe
      INNER JOIN examenes e ON e.id = pe.examen_id
      WHERE pe.presupuesto_id = ${id}
    `;

    await tx`
      UPDATE presupuestos
      SET estado = 'Convertido', resultado_id = ${resultadoId}
      WHERE id = ${id}
    `;
    await tx`
      INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (${actor}, 'presupuestos.convert_to_resultado', ${ENTITY_TYPE}, ${id},
        ${tx.json({ resultado_id: resultadoId })})
    `;

    return { resultado_id: resultadoId };
  });
}

export async function search(input: { term: string }): Promise<Presupuesto[]> {
  const sql = getSql();
  const term = input.term.trim();
  const rows = await sql<Record<string, unknown>[]>`${headerSql(sql)}
    WHERE p.id::text ILIKE ${`%${term}%`}
       OR COALESCE(p.paciente_nombre_libre, '') ILIKE ${`%${term}%`}
       OR COALESCE(pa.nombre || ' ' || pa.apellido, '') ILIKE ${`%${term}%`}
    ORDER BY p.created_at DESC LIMIT 20`;
  return hydrate(rows, sql);
}

export async function create(input: unknown, createdBy?: string): Promise<Presupuesto> {
  const parsed = presupuestoCreateSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const raw = input as Record<string, unknown>;
  const actor = createdBy ?? (typeof raw.created_by === "string" ? raw.created_by : undefined);
  if (!actor) throw new Error("CREATED_BY_REQUERIDO");

  return withTransaction(async (tx) => {
    const examIds = parsed.data.examenes.map((linea) => linea.examen_id);
    const exams = await tx<{ id: string; nombre: string; precio_usd: Numeric }[]>`
      SELECT id, nombre, precio_usd FROM examenes WHERE id IN ${tx(examIds)} AND activo = true
    `;
    if (exams.length !== examIds.length) throw new Error(EXAMEN_NO_ENCONTRADO);
    const examById = new Map(exams.map((exam) => [exam.id, exam]));
    const subtotal = exams.reduce((sum, exam) => sum + numberOf(exam.precio_usd), 0);
    const totals = calcularTotales({ subtotal, descuentoPct: parsed.data.descuento_pct, gananciaPct: parsed.data.ganancia_pct, tasa: parsed.data.tasa_bs });
    const headers = await tx<Record<string, unknown>[]>`
      INSERT INTO presupuestos (paciente_id, paciente_nombre_libre, descuento_pct, ganancia_pct, tasa_bs, total_usd, total_bs, estado, created_by)
      VALUES (${parsed.data.paciente_id ?? null}, ${parsed.data.paciente_nombre_libre ?? null}, ${parsed.data.descuento_pct}, ${parsed.data.ganancia_pct}, ${parsed.data.tasa_bs}, ${totals.totalUsd}, ${totals.totalBs}, 'Borrador', ${actor})
      RETURNING id
    `;
    const id = String(headers[0]!.id);
    for (const [orden, linea] of parsed.data.examenes.entries()) {
      const exam = examById.get(linea.examen_id)!;
      await tx`
        INSERT INTO presupuestos_examenes (presupuesto_id, examen_id, nombre_snap, precio_snap, orden)
        VALUES (${id}, ${exam.id}, ${exam.nombre}, ${numberOf(exam.precio_usd)}, ${orden})
      `;
    }
    await tx`INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata) VALUES (${actor}, 'presupuestos.create', ${ENTITY_TYPE}, ${id}, ${tx.json({ total_usd: totals.totalUsd, total_bs: totals.totalBs })})`;
    return id;
  }).then((id) => getById(id)) as Promise<Presupuesto>;
}

export async function update(id: string, input: unknown, updatedBy?: string): Promise<Presupuesto> {
  const parsed = presupuestoUpdateSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const data = parsed.data;
  return withTransaction(async (tx) => {
    const existing = await tx<Record<string, unknown>[]>`SELECT * FROM presupuestos WHERE id = ${id} FOR UPDATE`;
    if (!existing[0]) throw new Error(PRESUPUESTO_NO_ENCONTRADO);
    if (existing[0].estado !== "Borrador") throw new Error(PRESUPUESTO_NO_BORRADOR);
    if (data.estado !== undefined) throw new Error("ESTADO_SOLO_UPDATE_ESTADO");
    const current = existing[0];
    const pacienteId = (data.paciente_id !== undefined ? data.paciente_id : current.paciente_id) as string | null | undefined;
    const nombreLibre = (data.paciente_nombre_libre !== undefined ? data.paciente_nombre_libre : current.paciente_nombre_libre) as string | null | undefined;
    if ((pacienteId == null) === (nombreLibre == null)) throw new Error(PACIENTE_XOR_REQUIRED);
    let totalUsd = numberOf(current.total_usd as Numeric);
    let totalBs = numberOf(current.total_bs as Numeric);
    const examenes = data.examenes;
    if (examenes) {
      const ids = examenes.map((linea) => linea.examen_id);
      const exams = await tx<{ id: string; nombre: string; precio_usd: Numeric }[]>`SELECT id, nombre, precio_usd FROM examenes WHERE id IN ${tx(ids)} AND activo = true`;
      if (exams.length !== ids.length) throw new Error(EXAMEN_NO_ENCONTRADO);
      const byId = new Map(exams.map((exam) => [exam.id, exam]));
      const subtotal = exams.reduce((sum, exam) => sum + numberOf(exam.precio_usd), 0);
      const totals = calcularTotales({ subtotal, descuentoPct: data.descuento_pct ?? numberOf(current.descuento_pct as Numeric), gananciaPct: data.ganancia_pct ?? numberOf(current.ganancia_pct as Numeric), tasa: data.tasa_bs ?? numberOf(current.tasa_bs as Numeric) });
      totalUsd = totals.totalUsd; totalBs = totals.totalBs;
      await tx`DELETE FROM presupuestos_examenes WHERE presupuesto_id = ${id}`;
      for (const [orden, linea] of examenes.entries()) {
        const exam = byId.get(linea.examen_id)!;
        await tx`INSERT INTO presupuestos_examenes (presupuesto_id, examen_id, nombre_snap, precio_snap, orden) VALUES (${id}, ${exam.id}, ${exam.nombre}, ${numberOf(exam.precio_usd)}, ${orden})`;
      }
    } else if (data.descuento_pct !== undefined || data.ganancia_pct !== undefined || data.tasa_bs !== undefined) {
      const lines = await tx<{ precio_snap: Numeric }[]>`SELECT precio_snap FROM presupuestos_examenes WHERE presupuesto_id = ${id}`;
      const totals = calcularTotales({ subtotal: lines.reduce((sum, line) => sum + numberOf(line.precio_snap), 0), descuentoPct: data.descuento_pct ?? numberOf(current.descuento_pct as Numeric), gananciaPct: data.ganancia_pct ?? numberOf(current.ganancia_pct as Numeric), tasa: data.tasa_bs ?? numberOf(current.tasa_bs as Numeric) });
      totalUsd = totals.totalUsd; totalBs = totals.totalBs;
    }
    const descuento = data.descuento_pct ?? (current.descuento_pct as Numeric);
    const ganancia = data.ganancia_pct ?? (current.ganancia_pct as Numeric);
    const tasa = data.tasa_bs ?? (current.tasa_bs as Numeric);
    const updated = await tx<Record<string, unknown>[]>`UPDATE presupuestos SET paciente_id = ${pacienteId ?? null}, paciente_nombre_libre = ${nombreLibre ?? null}, descuento_pct = ${descuento}, ganancia_pct = ${ganancia}, tasa_bs = ${tasa}, total_usd = ${totalUsd}, total_bs = ${totalBs} WHERE id = ${id} RETURNING id`;
    await tx`INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata) VALUES (${updatedBy ?? null}, 'presupuestos.update', ${ENTITY_TYPE}, ${id}, ${tx.json(data as any)})`;
    return String(updated[0]!.id);
  }).then((resultId) => getById(resultId)) as Promise<Presupuesto>;
}

export async function updateEstado(id: string, estado: unknown, resultadoId?: string | null, updatedBy?: string): Promise<Presupuesto> {
  const parsed = estadoPresupuestoSchema.safeParse(estado);
  if (!parsed.success) throw new Error("ESTADO_INVALIDO");
  if (parsed.data === "Convertido" && !resultadoId) throw new Error(RESULTADO_ID_REQUERIDO);
  return withTransaction(async (tx) => {
    const current = await tx<Record<string, unknown>[]>`SELECT id, estado FROM presupuestos WHERE id = ${id} FOR UPDATE`;
    if (!current[0]) throw new Error(PRESUPUESTO_NO_ENCONTRADO);
    const rows = await tx<Record<string, unknown>[]>`UPDATE presupuestos SET estado = ${parsed.data}, resultado_id = ${resultadoId ?? null} WHERE id = ${id} RETURNING id`;
    await tx`INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata) VALUES (${updatedBy ?? null}, 'presupuestos.update_estado', ${ENTITY_TYPE}, ${id}, ${tx.json({ estado: parsed.data, resultado_id: resultadoId ?? null })})`;
    return String(rows[0]!.id);
  }).then((resultId) => getById(resultId)) as Promise<Presupuesto>;
}

export async function remove(id: string, deletedBy?: string): Promise<{ id: string }> {
  return withTransaction(async (tx) => {
    const rows = await tx<{ id: string }[]>`DELETE FROM presupuestos WHERE id = ${id} RETURNING id`;
    if (!rows[0]) throw new Error(PRESUPUESTO_NO_ENCONTRADO);
    await tx`INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata) VALUES (${deletedBy ?? null}, 'presupuestos.delete', ${ENTITY_TYPE}, ${id}, '{}'::jsonb)`;
    return rows[0];
  });
}

export { remove as delete };
