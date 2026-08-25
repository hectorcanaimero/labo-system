import { NextResponse, type NextRequest } from "next/server";

import { list } from "@labo/db/repos/audit";
import { AuthError, requireRole } from "@labo/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;

function toNumber(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * GET /api/audit — lista eventos del `audit_log` (F4.1.T6, Admin only).
 *
 * Query params (todos opcionales):
 *  - `page`, `limit`
 *  - `usuarioId` (uuid exacto de `usuarios`)
 *  - `usuario` (texto: matchea nombre/email)
 *  - `accion`
 *  - `entity` (entity_type)
 *  - `desde`, `hasta` (ISO 8601)
 *
 * Respuesta `{ items, page, limit, total, totalPages }`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireRole("admin");
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.code }, { status });
    }
    throw error;
  }

  try {
    const { searchParams } = request.nextUrl;
    const result = await list({
      page: toNumber(searchParams.get("page"), DEFAULT_PAGE),
      limit: toNumber(searchParams.get("limit"), DEFAULT_LIMIT),
      filters: {
        usuarioId: searchParams.get("usuarioId") ?? undefined,
        usuario: searchParams.get("usuario") ?? undefined,
        accion: searchParams.get("accion") ?? undefined,
        entityType: searchParams.get("entity") ?? undefined,
        desde: searchParams.get("desde") ?? undefined,
        hasta: searchParams.get("hasta") ?? undefined,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("No se pudo listar el audit_log:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
