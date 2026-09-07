import { NextResponse, type NextRequest } from "next/server";

import {
  create as metodosCreate,
  list as metodosList,
  update as metodosUpdate,
  METODO_DUPLICADO,
  METODO_NO_ENCONTRADO,
  METODOS_TABLA_FALTANTE,
} from "@labo/db/repos/metodos";
import { AuthError, getCurrentUser, requireRole } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

async function requireOperadorMinimo(): Promise<void> {
  const user = await getCurrentUser();
  if (user.role !== "admin" && user.role !== "operador") {
    throw new AuthError("UNAUTHORIZED");
  }
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
    case METODO_NO_ENCONTRADO:
      return { status: 404, error: code };
    case METODO_DUPLICADO:
      return { status: 409, error: code };
    case METODOS_TABLA_FALTANTE:
      return { status: 503, error: code };
    case "VALIDACION_FALLIDA":
      return { status: 400, error: code };
    default:
      console.error("metodos:", error);
      return { status: 500, error: "ERROR_GENERICO" };
  }
}

/**
 * `GET /api/examenes/metodos` — lista para el selector del examen.
 *
 * `?incluirInactivos=1` (admin) agrega los desactivados, que es lo que necesita
 * la pantalla de administración en Config.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const incluirInactivos =
      request.nextUrl.searchParams.get("incluirInactivos") === "1";

    if (incluirInactivos) await requireRole("admin");
    else await requireOperadorMinimo();

    return NextResponse.json(await metodosList(getAdminDb(), { incluirInactivos }));
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

/** `POST /api/examenes/metodos` — alta de un método. Solo admin. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return bad(400, "VALIDACION_FALLIDA");

    const metodo = await metodosCreate(getAdminDb(), {
      nombre: body.nombre,
      usuarioId: user.userId,
    });
    return NextResponse.json(metodo, { status: 201 });
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

/**
 * `PATCH /api/examenes/metodos` — renombrar o activar/desactivar. Solo admin.
 *
 * Body: `{ id, nombre?, activo? }`.
 */
export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return bad(400, "VALIDACION_FALLIDA");

    const metodo = await metodosUpdate(getAdminDb(), {
      id: body.id,
      nombre: body.nombre,
      activo: body.activo,
      usuarioId: user.userId,
    });
    return NextResponse.json(metodo);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
