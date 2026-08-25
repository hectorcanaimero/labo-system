import { NextResponse, type NextRequest } from "next/server";

import {
  examenesCreate,
  examenesListByTitulo,
  examenesSearch,
} from "@labo/db/repos/examenes";
import { AuthError, getCurrentUser, requireRole } from "@labo/lib/server/auth";

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
    case "EXAMEN_NO_ENCONTRADO":
    case "TITULO_NO_ENCONTRADO":
      return { status: 404, error: code };
    case "EXAMEN_DUPLICADO_EN_TITULO":
      return { status: 409, error: code };
    case "VALIDACION_FALLIDA":
      return { status: 400, error: code };
    default:
      return { status: 500, error: "ERROR_GENERICO" };
  }
}

/**
 * GET /api/examenes?term=<prefix>      → búsqueda prefix top 10.
 * GET /api/examenes?titulo_id=<uuid>   → listado activo de un título.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const term = request.nextUrl.searchParams.get("term");
    if (term !== null) {
      const items = await examenesSearch({ term });
      return NextResponse.json(items);
    }

    const tituloId = request.nextUrl.searchParams.get("titulo_id");
    if (!tituloId) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const items = await examenesListByTitulo({ titulo_id: tituloId });
    return NextResponse.json(items);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const examen = await examenesCreate({
      titulo_id: body.titulo_id as string,
      nombre: body.nombre as string,
      precio_usd: body.precio_usd as number,
      unidad: body.unidad as string | undefined,
      valores_referencia: body.valores_referencia as string | undefined,
      usuarioId: user.userId,
    });
    return NextResponse.json(examen, { status: 201 });
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
