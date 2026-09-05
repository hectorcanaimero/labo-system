import { NextResponse, type NextRequest } from "next/server";

import {
  delete as deleteResultado,
  EXAMEN_NO_ENCONTRADO,
  getById,
  RESULTADO_NO_ENCONTRADO,
  update,
  updateEstado,
} from "@labo/db/repos/resultados";
import { AuthError, getCurrentUser, requireRole } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

function toStatus(error: unknown): { status: number; error: string } {
  if (error instanceof AuthError) return { status: error.code === "UNAUTHENTICATED" ? 401 : 403, error: error.code };
  const code = error instanceof Error ? error.message : "ERROR_GENERICO";
  if (code === RESULTADO_NO_ENCONTRADO || code === EXAMEN_NO_ENCONTRADO) return { status: 404, error: code };
  if (code.startsWith("FECHA_") || code.startsWith("EXAMENES_") || code.startsWith("ESTADO_") || code.startsWith("ENTREGA_") || code.endsWith("_REQUERIDO") || code === "VALIDACION_FALLIDA") return { status: 400, error: code };
  return { status: 500, error: "ERROR_GENERICO" };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function hasValidPatchIds(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const examenes = (body as Record<string, unknown>).examenes;
  if (examenes === undefined) return true;
  if (!Array.isArray(examenes)) return false;
  return examenes.every((linea) => {
    if (!linea || typeof linea !== "object" || Array.isArray(linea)) return false;
    return isUuid((linea as Record<string, unknown>).examen_id);
  });
}

async function requireOperador() {
  const user = await getCurrentUser();
  if (user.role !== "admin" && user.role !== "operador") throw new AuthError("UNAUTHORIZED");
  return user;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  try {
    await requireOperador();
    if (!isUuid(params.id)) return bad(400, "VALIDACION_FALLIDA");
    const resultado = await getById(getAdminDb(), params.id);
    return resultado ? NextResponse.json(resultado) : bad(404, RESULTADO_NO_ENCONTRADO);
  } catch (error) {
    const mapped = toStatus(error);
    return bad(mapped.status, mapped.error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  try {
    const user = await requireOperador();
    if (!isUuid(params.id)) return bad(400, "VALIDACION_FALLIDA");
    const body = await request.json().catch(() => null) as unknown;
    if (!hasValidPatchIds(body)) return bad(400, "VALIDACION_FALLIDA");
    const db = getAdminDb();
    const resultado = Object.keys(body).length === 1 && "estado" in body
      ? await updateEstado(db, params.id, body.estado, user.userId)
      : await update(db, params.id, body, user.userId);
    return NextResponse.json(resultado);
  } catch (error) {
    const mapped = toStatus(error);
    return bad(mapped.status, mapped.error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  try {
    const user = await requireRole("admin");
    if (!isUuid(params.id)) return bad(400, "VALIDACION_FALLIDA");
    return NextResponse.json(await deleteResultado(getAdminDb(), params.id, user.userId));
  } catch (error) {
    const mapped = toStatus(error);
    return bad(mapped.status, mapped.error);
  }
}
