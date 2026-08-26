import type { Sql, TransactionSql } from "postgres";

import { getSql, withTransaction } from "../client";
import {
  estadoResultadoSchema,
  resultadoCreateSchema,
  resultadoUpdateSchema,
  type EstadoResultado,
} from "@labo/lib/schemas/resultado";

export const RESULTADO_NO_ENCONTRADO = "RESULTADO_NO_ENCONTRADO";
export const PACIENTE_NO_ENCONTRADO = "PACIENTE_NO_ENCONTRADO";
export const EXAMEN_NO_ENCONTRADO = "EXAMEN_NO_ENCONTRADO";
export const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
export const ESTADO_FECHA_INCOHERENTE = "ESTADO_FECHA_INCOHERENTE";
export const ESTADO_REQUIERE_FECHA_RESULTADO = "ESTADO_REQUIERE_FECHA_RESULTADO";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SEARCH_LIMIT = 50;

interface ResultadoRow {
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

interface ResultadoListRow extends ResultadoRow {
  paciente_nombre: string;
  paciente_apellido: string;
  paciente_cedula: string;
  examenes_count: number;
}

interface LineaRow {
  id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: number | string;
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
  precio_usd: number | string;
  unidad: string | null;
  valores_referencia: string | null;
  tipo_analisis: string | null;
  metodo: string | null;
}

export interface ResultadoFilters {
  pacienteId?: string;
  estado?: EstadoResultado;
  desde?: string | Date;
  hasta?: string | Date;
}

export interface ResultadoListInput {
  page?: number;
  limit?: number;
  filters?: ResultadoFilters;
}

export interface ResultadoLinea extends Omit<LineaRow, "precio_snap"> {
  precio_snap: number;
}

export interface Resultado extends ResultadoRow {}
export interface ResultadoListItem extends ResultadoListRow {}
export interface ResultadoDetail extends Resultado {
  examenes: ResultadoLinea[];
}

export interface ResultadoListResult {
  items: ResultadoListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ResultadoSearchInput {
  term: string;
  filters?: ResultadoFilters;
}

export interface ResultadoPaciente {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: Date;
  sexo: "M" | "F" | "O" | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
}

export interface ResultadoConfig {
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

export interface ResultadoLineaPDF extends ResultadoLinea {
  /** Nombre del grupo (examenes_titulos) vigente del catálogo; null si el examen fue eliminado. */
  titulo: string | null;
}

export interface ResultadoForPDF extends Omit<ResultadoDetail, "examenes"> {
  examenes: ResultadoLineaPDF[];
  paciente: ResultadoPaciente;
  config: ResultadoConfig | null;
}

export type AssetUrlResolver = (objectKey: string) => Promise<string>;

function normalizePagination(input: ResultadoListInput) {
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
      const timestamp = new Date(value).getTime();
      if (!Number.isNaN(timestamp)) data[key] = timestamp;
    }
  }
  return data;
}

function validationError(error: { issues?: Array<{ message?: unknown }> }): Error {
  const message = error.issues?.find((issue) => typeof issue.message === "string")?.message;
  return new Error(typeof message === "string" ? message : VALIDACION_FALLIDA);
}

function trimOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapLinea<T extends LineaRow>(row: T) {
  return { ...row, precio_snap: Number(row.precio_snap) };
}

function buildWhere(sql: Sql, filters?: ResultadoFilters) {
  let where = sql`TRUE`;
  if (filters?.pacienteId?.trim()) {
    where = sql`${where} AND r.paciente_id = ${filters.pacienteId.trim()}`;
  }
  if (filters?.estado) where = sql`${where} AND r.estado = ${filters.estado}`;
  if (filters?.desde) where = sql`${where} AND r.fecha_muestra >= ${filters.desde}::timestamptz`;
  if (filters?.hasta) {
    where = sql`${where} AND r.fecha_muestra < (${filters.hasta}::date + INTERVAL '1 day')`;
  }
  return where;
}

async function fetchLineas(sql: Sql | TransactionSql, resultadoId: string) {
  const rows = await sql<LineaRow[]>`
    SELECT id, examen_id, nombre_snap, precio_snap, unidad_snap,
           valores_referencia_snap, tipo_analisis_snap, metodo_snap,
           valor, observacion, orden
    FROM resultados_examenes
    WHERE resultado_id = ${resultadoId}
    ORDER BY orden ASC, id ASC
  `;
  return rows.map(mapLinea);
}

/**
 * Hidratación exclusiva del PDF: igual que `fetchLineas` pero resuelve el
 * título (grupo) vigente del catálogo vía `examenes → examenes_titulos`.
 * LEFT JOIN: líneas cuyo examen fue eliminado del catálogo quedan con
 * `titulo = null` y caen en el grupo residual del informe.
 */
async function fetchLineasForPDF(sql: Sql, resultadoId: string): Promise<ResultadoLineaPDF[]> {
  const rows = await sql<Array<LineaRow & { titulo: string | null }>>`
    SELECT re.id, re.examen_id, re.nombre_snap, re.precio_snap, re.unidad_snap,
           re.valores_referencia_snap, re.tipo_analisis_snap, re.metodo_snap,
           re.valor, re.observacion, re.orden,
           t.nombre AS titulo
    FROM resultados_examenes re
    LEFT JOIN examenes e ON e.id = re.examen_id
    LEFT JOIN examenes_titulos t ON t.id = e.titulo_id
    WHERE re.resultado_id = ${resultadoId}
    ORDER BY re.orden ASC, re.id ASC
  `;
  return rows.map(mapLinea);
}

async function insertLineas(
  tx: TransactionSql,
  resultadoId: string,
  examenes: Array<{ examen_id: string; valor: string; observacion?: string }>,
  existing: Map<string, ResultadoLinea> = new Map(),
): Promise<void> {
  const ids = [...new Set(examenes.map((linea) => linea.examen_id))];
  const catalogo = await tx<CatalogoRow[]>`
    SELECT id, nombre, precio_usd, unidad, valores_referencia, tipo_analisis, metodo
    FROM examenes
    WHERE id IN ${tx(ids)}
      AND activo = true
  `;
  const catalogById = new Map(catalogo.map((row) => [row.id, row]));

  const values = examenes.map((linea, index) => {
    const snapshot = existing.get(linea.examen_id);
    const source = catalogById.get(linea.examen_id);
    if (!snapshot && !source) throw new Error(EXAMEN_NO_ENCONTRADO);
    return {
      resultado_id: resultadoId,
      examen_id: linea.examen_id,
      nombre_snap: snapshot?.nombre_snap ?? source!.nombre,
      precio_snap: snapshot?.precio_snap ?? Number(source!.precio_usd),
      unidad_snap: snapshot?.unidad_snap ?? source!.unidad,
      valores_referencia_snap:
        snapshot?.valores_referencia_snap ?? source!.valores_referencia,
      tipo_analisis_snap: snapshot?.tipo_analisis_snap ?? source!.tipo_analisis,
      metodo_snap: snapshot?.metodo_snap ?? source!.metodo,
      valor: linea.valor,
      observacion: trimOrNull(linea.observacion),
      orden: index + 1,
    };
  });

  await tx`
    INSERT INTO resultados_examenes ${tx(
      values,
      "resultado_id",
      "examen_id",
      "nombre_snap",
      "precio_snap",
      "unidad_snap",
      "valores_referencia_snap",
      "tipo_analisis_snap",
      "metodo_snap",
      "valor",
      "observacion",
      "orden",
    )}
  `;
}

async function getByIdWith(sql: Sql | TransactionSql, id: string): Promise<ResultadoDetail | null> {
  const rows = await sql<ResultadoRow[]>`
    SELECT id, paciente_id, fecha_muestra, fecha_resultado, medico_solicitante,
           estado, observaciones, origen_presupuesto_id, created_at, created_by
    FROM resultados WHERE id = ${id} LIMIT 1
  `;
  const resultado = rows[0];
  if (!resultado) return null;
  return { ...resultado, examenes: await fetchLineas(sql, id) };
}

export async function list(input: ResultadoListInput = {}): Promise<ResultadoListResult> {
  const sql = getSql();
  const { page, limit } = normalizePagination(input);
  const offset = (page - 1) * limit;
  const where = buildWhere(sql, input.filters);
  const [items, counts] = await Promise.all([
    sql<ResultadoListRow[]>`
      SELECT r.id, r.paciente_id, r.fecha_muestra, r.fecha_resultado,
             r.medico_solicitante, r.estado, r.observaciones,
             r.origen_presupuesto_id, r.created_at, r.created_by,
             p.nombre AS paciente_nombre, p.apellido AS paciente_apellido,
             p.cedula AS paciente_cedula, COUNT(re.id)::int AS examenes_count
      FROM resultados r
      INNER JOIN pacientes p ON p.id = r.paciente_id
      LEFT JOIN resultados_examenes re ON re.resultado_id = r.id
      WHERE ${where}
      GROUP BY r.id, p.id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM resultados r WHERE ${where}
    `,
  ]);
  const total = Number(counts[0]?.count ?? 0);
  return { items, page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 };
}

export async function search(input: ResultadoSearchInput): Promise<ResultadoListItem[]> {
  const term = input.term.trim();
  if (!term) return [];
  const sql = getSql();
  const where = buildWhere(sql, input.filters);
  const pattern = `%${term}%`;
  return sql<ResultadoListRow[]>`
    SELECT r.id, r.paciente_id, r.fecha_muestra, r.fecha_resultado,
           r.medico_solicitante, r.estado, r.observaciones,
           r.origen_presupuesto_id, r.created_at, r.created_by,
           p.nombre AS paciente_nombre, p.apellido AS paciente_apellido,
           p.cedula AS paciente_cedula, COUNT(re.id)::int AS examenes_count
    FROM resultados r
    INNER JOIN pacientes p ON p.id = r.paciente_id
    LEFT JOIN resultados_examenes re ON re.resultado_id = r.id
    WHERE ${where}
      AND (p.nombre ILIKE ${pattern} OR p.apellido ILIKE ${pattern}
        OR concat_ws(' ', p.nombre, p.apellido) ILIKE ${pattern}
        OR p.cedula ILIKE ${pattern}
        OR to_char(r.fecha_muestra, 'DD/MM/YYYY') ILIKE ${pattern}
        OR to_char(r.fecha_muestra, 'YYYY-MM-DD') ILIKE ${pattern})
    GROUP BY r.id, p.id
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${SEARCH_LIMIT}
  `;
}

export async function getById(id: string): Promise<ResultadoDetail | null> {
  return getByIdWith(getSql(), id);
}

export async function getForPDF(
  id: string,
  resolveAssetUrl: AssetUrlResolver,
): Promise<ResultadoForPDF | null> {
  const sql = getSql();
  const resultado = await getByIdWith(sql, id);
  if (!resultado) return null;
  const [examenes, pacientes, configs] = await Promise.all([
    fetchLineasForPDF(sql, id),
    sql<ResultadoPaciente[]>`
      SELECT id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono,
             email, direccion FROM pacientes WHERE id = ${resultado.paciente_id} LIMIT 1
    `,
    sql<Array<Omit<ResultadoConfig, "logo_url" | "firma_url" | "sello_url">>>`
      SELECT nombre, direccion, telefono, email, rif, colegio_bioanalistas, mpps,
             logo_object_key, firma_object_key, sello_object_key, pdf_pie_pagina
      FROM laboratorio_config WHERE singleton = true LIMIT 1
    `,
  ]);
  const paciente = pacientes[0];
  if (!paciente) throw new Error(PACIENTE_NO_ENCONTRADO);
  const configRow = configs[0];
  let config: ResultadoConfig | null = null;
  if (configRow) {
    const resolve = async (key: string | null) => key ? resolveAssetUrl(key) : null;
    const [logo_url, firma_url, sello_url] = await Promise.all([
      resolve(configRow.logo_object_key),
      resolve(configRow.firma_object_key),
      resolve(configRow.sello_object_key),
    ]);
    config = { ...configRow, logo_url, firma_url, sello_url };
  }
  return { ...resultado, examenes, paciente, config };
}

export async function create(input: unknown, usuarioId: string): Promise<ResultadoDetail> {
  const parsed = resultadoCreateSchema.safeParse(coerceDates(input));
  if (!parsed.success) throw validationError(parsed.error);
  const data = parsed.data;
  return withTransaction(async (tx) => {
    const paciente = await tx<{ id: string }[]>`
      SELECT id FROM pacientes WHERE id = ${data.paciente_id} AND activo = true LIMIT 1
    `;
    if (!paciente[0]) throw new Error(PACIENTE_NO_ENCONTRADO);
    const fechaResultado = data.fecha_resultado ? new Date(data.fecha_resultado) : null;
    const rows = await tx<ResultadoRow[]>`
      INSERT INTO resultados
        (paciente_id, fecha_muestra, fecha_resultado, medico_solicitante,
         estado, observaciones, created_by)
      VALUES (${data.paciente_id}, ${new Date(data.fecha_muestra)}, ${fechaResultado},
        ${trimOrNull(data.medico_solicitante)},
        ${fechaResultado ? "Completado" : "Pendiente"},
        ${trimOrNull(data.observaciones)}, ${usuarioId})
      RETURNING id, paciente_id, fecha_muestra, fecha_resultado, medico_solicitante,
                estado, observaciones, origen_presupuesto_id, created_at, created_by
    `;
    const resultado = rows[0]!;
    await insertLineas(tx, resultado.id, data.examenes);
    await tx`INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (${usuarioId}, ${"resultados.create"}, ${"resultados"}, ${resultado.id},
        ${tx.json({ paciente_id: data.paciente_id, examenes: data.examenes.length })})`;
    return { ...resultado, examenes: await fetchLineas(tx, resultado.id) };
  });
}

export async function update(
  id: string,
  input: unknown,
  usuarioId: string,
): Promise<ResultadoDetail> {
  const coerced = coerceDates(input);
  const inputRecord = coerced && typeof coerced === "object" && !Array.isArray(coerced)
    ? coerced as Record<string, unknown>
    : null;
  const clearsFechaResultado = inputRecord?.fecha_resultado === null;
  const schemaInput = clearsFechaResultado
    ? Object.fromEntries(Object.entries(inputRecord).filter(([key]) => key !== "fecha_resultado"))
    : coerced;
  const parsed = resultadoUpdateSchema.safeParse(schemaInput);
  if (!parsed.success) throw validationError(parsed.error);
  const data = parsed.data;
  return withTransaction(async (tx) => {
    const current = await getByIdWith(tx, id);
    if (!current) throw new Error(RESULTADO_NO_ENCONTRADO);
    const fechaMuestra = data.fecha_muestra ? new Date(data.fecha_muestra) : current.fecha_muestra;
    let fechaResultado = clearsFechaResultado
      ? null
      : data.fecha_resultado === undefined
        ? current.fecha_resultado
        : new Date(data.fecha_resultado);

    if (data.estado === "Pendiente") {
      if (data.fecha_resultado !== undefined) throw new Error(ESTADO_FECHA_INCOHERENTE);
      fechaResultado = null;
    } else if (data.estado === "Completado" && !fechaResultado) {
      throw new Error(ESTADO_REQUIERE_FECHA_RESULTADO);
    }
    if (fechaResultado && fechaResultado < fechaMuestra) {
      throw new Error("FECHA_RESULTADO_ANTERIOR_MUESTRA");
    }
    const estado: EstadoResultado = fechaResultado ? "Completado" : "Pendiente";
    const rows = await tx<ResultadoRow[]>`
      UPDATE resultados SET
        fecha_muestra = ${fechaMuestra}, fecha_resultado = ${fechaResultado},
        medico_solicitante = ${data.medico_solicitante === undefined ? current.medico_solicitante : trimOrNull(data.medico_solicitante)},
        estado = ${estado},
        observaciones = ${data.observaciones === undefined ? current.observaciones : trimOrNull(data.observaciones)}
      WHERE id = ${id}
      RETURNING id, paciente_id, fecha_muestra, fecha_resultado, medico_solicitante,
                estado, observaciones, origen_presupuesto_id, created_at, created_by
    `;
    if (data.examenes) {
      const snapshots = new Map(current.examenes.map((linea) => [linea.examen_id, linea]));
      await tx`DELETE FROM resultados_examenes WHERE resultado_id = ${id}`;
      await insertLineas(tx, id, data.examenes, snapshots);
    }
    await tx`INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (${usuarioId}, ${"resultados.update"}, ${"resultados"}, ${id},
        ${tx.json({ fields: Object.keys(data) })})`;
    return { ...rows[0]!, examenes: await fetchLineas(tx, id) };
  });
}

export async function updateEstado(
  id: string,
  estadoInput: unknown,
  usuarioId: string,
): Promise<ResultadoDetail> {
  const parsed = estadoResultadoSchema.safeParse(estadoInput);
  if (!parsed.success) throw validationError(parsed.error);
  return withTransaction(async (tx) => {
    const current = await getByIdWith(tx, id);
    if (!current) throw new Error(RESULTADO_NO_ENCONTRADO);
    if (parsed.data === "Completado" && !current.fecha_resultado) {
      throw new Error(ESTADO_REQUIERE_FECHA_RESULTADO);
    }
    const fechaResultado = parsed.data === "Pendiente" ? null : current.fecha_resultado;
    const rows = await tx<ResultadoRow[]>`
      UPDATE resultados SET estado = ${parsed.data}, fecha_resultado = ${fechaResultado}
      WHERE id = ${id}
      RETURNING id, paciente_id, fecha_muestra, fecha_resultado, medico_solicitante,
                estado, observaciones, origen_presupuesto_id, created_at, created_by
    `;
    const resultado = rows[0];
    if (!resultado) throw new Error(RESULTADO_NO_ENCONTRADO);
    await tx`INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (${usuarioId}, ${"resultados.update_estado"}, ${"resultados"}, ${id},
        ${tx.json({ estado: parsed.data })})`;
    return { ...resultado, examenes: await fetchLineas(tx, id) };
  });
}

async function deleteResultado(id: string, usuarioId: string): Promise<Resultado> {
  return withTransaction(async (tx) => {
    const rows = await tx<ResultadoRow[]>`
      DELETE FROM resultados WHERE id = ${id}
      RETURNING id, paciente_id, fecha_muestra, fecha_resultado, medico_solicitante,
                estado, observaciones, origen_presupuesto_id, created_at, created_by
    `;
    const resultado = rows[0];
    if (!resultado) throw new Error(RESULTADO_NO_ENCONTRADO);
    await tx`INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (${usuarioId}, ${"resultados.delete"}, ${"resultados"}, ${id},
        ${tx.json({ paciente_id: resultado.paciente_id })})`;
    return resultado;
  });
}

export { deleteResultado as delete };
