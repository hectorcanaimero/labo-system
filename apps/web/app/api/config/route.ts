import { NextResponse, type NextRequest } from "next/server";

import { get, update } from "@labo/db/repos/config";
import { AuthError, getCurrentUser, requireRole } from "@/lib/server/auth";
import { NOMBRE_REQUERIDO, RIF_INVALIDO, DIRECCION_REQUERIDA } from "@labo/lib/schemas/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

function toStatus(error: unknown): { status: number; error: string } {
  if (error instanceof AuthError) {
    return {
      status: error.code === "UNAUTHENTICATED" ? 401 : 403,
      error: error.code,
    };
  }

  const code = error instanceof Error ? error.message : "ERROR_GENERICO";
  switch (code) {
    case NOMBRE_REQUERIDO:
    case RIF_INVALIDO:
    case DIRECCION_REQUERIDA:
    case "VALIDACION_FALLIDA":
      return { status: 400, error: code };
    default:
      return { status: 500, error: "ERROR_GENERICO" };
  }
}

/**
 * `GET /api/config` — lectura del singleton (cualquier usuario autenticado).
 * Retorna `null` en el primer arranque.
 */
export async function GET(): Promise<Response> {
  try {
    await getCurrentUser();
    const config = await get();
    return NextResponse.json(config);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

/**
 * `PUT /api/config` — upsert Admin only (`UNAUTHORIZED` si operador).
 */
export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!body) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const config = await update(body, user.userId);
    return NextResponse.json(config);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
