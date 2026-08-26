import { NextResponse, type NextRequest } from "next/server";

import {
  create,
  EXAMEN_NO_ENCONTRADO,
  list,
  PACIENTE_NO_ENCONTRADO,
  search,
  type ResultadoFilters,
} from "@labo/db/repos/resultados";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { ESTADO_RESULTADO, type EstadoResultado } from "@labo/lib/schemas/resultado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

function toStatus(error: unknown): { status: number; error: string } {
  if (error instanceof AuthError) {
    return { status: error.code === "UNAUTHENTICATED" ? 401 : 403, error: error.code };
  }
  const code = error instanceof Error ? error.message : "ERROR_GENERICO";
  if (code === PACIENTE_NO_ENCONTRADO || code === EXAMEN_NO_ENCONTRADO) return { status: 404, error: code };
  if (code.startsWith("FECHA_") || code.startsWith("EXAMENES_") || code.endsWith("_REQUERIDO") || code === "VALIDACION_FALLIDA") {
    return { status: 400, error: code };
  }
  return { status: 500, error: "ERROR_GENERICO" };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month! - 1
    && date.getUTCDate() === day;
}

function isEstado(value: string): value is EstadoResultado {
  return ESTADO_RESULTADO.includes(value as EstadoResultado);
}

function parsePositiveInteger(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasValidReferencedIds(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (!isUuid(record.paciente_id)) return false;
  if (!Array.isArray(record.examenes)) return true;
  return record.examenes.every((linea) => {
    if (!linea || typeof linea !== "object" || Array.isArray(linea)) return false;
    return isUuid((linea as Record<string, unknown>).examen_id);
  });
}

async function requireOperador() {
  const user = await getCurrentUser();
  if (user.role !== "admin" && user.role !== "operador") throw new AuthError("UNAUTHORIZED");
  return user;
}

function filters(params: URLSearchParams): ResultadoFilters | null {
  const pacienteId = params.get("paciente_id");
  const estado = params.get("estado");
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  if (pacienteId !== null && !isUuid(pacienteId)) return null;
  if (estado !== null && !isEstado(estado)) return null;
  if (desde !== null && !isCalendarDate(desde)) return null;
  if (hasta !== null && !isCalendarDate(hasta)) return null;
  return {
    pacienteId: pacienteId ?? undefined,
    estado: estado ?? undefined,
    desde: desde ?? undefined,
    hasta: hasta ?? undefined,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireOperador();
    const params = request.nextUrl.searchParams;
    const parsedFilters = filters(params);
    const page = parsePositiveInteger(params.get("page"), 1);
    const limit = parsePositiveInteger(params.get("limit"), 20);
    if (!parsedFilters || page === null || limit === null) return bad(400, "VALIDACION_FALLIDA");
    const term = params.get("term");
    if (term !== null) return NextResponse.json(await search({ term, filters: parsedFilters }));
    return NextResponse.json(await list({
      page,
      limit,
      filters: parsedFilters,
    }));
  } catch (error) {
    const mapped = toStatus(error);
    return bad(mapped.status, mapped.error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireOperador();
    const body = await request.json().catch(() => null) as unknown;
    if (!hasValidReferencedIds(body)) return bad(400, "VALIDACION_FALLIDA");
    return NextResponse.json(await create(body, user.userId), { status: 201 });
  } catch (error) {
    const mapped = toStatus(error);
    return bad(mapped.status, mapped.error);
  }
}
