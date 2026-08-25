import type { Sql } from "postgres";

import { getSql } from "../client";

// ─────────────────────────────────────────────────────────────────────────────
// Repo de `audit_log` (F4.1.T6 — Audit log dashboard, Admin only).
//
// Sólo lectura: el dashboard es de visualización (no edit). La escritura la
// hacen los eventos de negocio (`usuarios.logAuthEvent`, `tasa.setManual`,
// etc.) con `accion` en formato "dominio.verbo".
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface AuditFilters {
  /** Filtra por `usuarios.id` exacto (uuid). */
  usuarioId?: string;
  /** Texto libre: matchea `usuarios.nombre` o `usuarios.email` (ILIKE). */
  usuario?: string;
  /** Texto libre sobre `accion` (ILIKE substring). */
  accion?: string;
  /** Texto libre sobre `entity_type` (ILIKE substring). */
  entityType?: string;
  /** Filtra `created_at >= desde` (ISO 8601). */
  desde?: string;
  /** Filtra `created_at <= hasta` (ISO 8601). */
  hasta?: string;
}

export interface AuditListInput {
  page?: number;
  limit?: number;
  filters?: AuditFilters;
}

export interface AuditEvent {
  id: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  usuarioEmail: string | null;
  accion: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditListResult {
  items: AuditEvent[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface AuditEventRow {
  id: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
  accion: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

function normalizePagination(
  input: AuditListInput,
): Required<Pick<AuditListInput, "page" | "limit">> {
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

/**
 * Construye el `WHERE` encadenando `sql`` ` fragments (dynamic query builder de
 * postgres.js). Sin filtros devuelve `TRUE`. Todos los valores van
 * parametrizados — nada se interpola en crudo.
 */
function buildWhere(sql: Sql, filters?: AuditFilters) {
  let where = sql`TRUE`;

  const usuarioId = filters?.usuarioId?.trim();
  if (usuarioId && usuarioId.length > 0) {
    where = sql`${where} AND a.usuario_id = ${usuarioId}`;
  }

  const usuario = filters?.usuario?.trim();
  if (usuario && usuario.length > 0) {
    where = sql`${where} AND (u.nombre ILIKE ${`%${usuario}%`} OR u.email ILIKE ${`%${usuario}%`})`;
  }

  const accion = filters?.accion?.trim();
  if (accion && accion.length > 0) {
    where = sql`${where} AND a.accion ILIKE ${`%${accion}%`}`;
  }

  const entityType = filters?.entityType?.trim();
  if (entityType && entityType.length > 0) {
    where = sql`${where} AND a.entity_type ILIKE ${`%${entityType}%`}`;
  }

  if (filters?.desde && filters.desde.length > 0) {
    where = sql`${where} AND a.created_at >= ${filters.desde}::timestamptz`;
  }

  if (filters?.hasta && filters.hasta.length > 0) {
    where = sql`${where} AND a.created_at <= ${filters.hasta}::timestamptz`;
  }

  return where;
}

/**
 * Paginado de `audit_log` (spec F4.1.T6).
 *
 * - `LEFT JOIN usuarios` para resolver nombre/email legible (el `audit_log`
 *   sobrevive a bajas de usuario por `ON DELETE SET NULL`).
 * - Orden `created_at DESC` (más reciente primero).
 * - Filtros: usuario (id exacto o texto nombre/email), acción, entity y rango
 *   de fechas.
 *
 * Retorna items + metadatos de paginación (`page`, `limit`, `total`,
 * `totalPages`).
 */
export async function list(
  input: AuditListInput = {},
): Promise<AuditListResult> {
  const sql = getSql();
  const { page, limit } = normalizePagination(input);
  const offset = (page - 1) * limit;
  const where = buildWhere(sql, input.filters);

  const [items, totalRows] = await Promise.all([
    sql<AuditEventRow[]>`
      SELECT
        a.id,
        a.usuario_id,
        u.nombre AS usuario_nombre,
        u.email  AS usuario_email,
        a.accion,
        a.entity_type,
        a.entity_id,
        a.metadata,
        a.created_at
      FROM audit_log a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM audit_log a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE ${where}
    `,
  ]);

  const total = Number(totalRows[0]?.count ?? 0);

  return {
    items: items.map((row) => ({
      id: row.id,
      usuarioId: row.usuario_id,
      usuarioNombre: row.usuario_nombre,
      usuarioEmail: row.usuario_email,
      accion: row.accion,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    })),
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
