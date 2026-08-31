import { NextResponse, type NextRequest } from "next/server";

import {
  examenesActivate,
  examenesDeactivate,
  examenesGetById,
  examenesUpdate,
} from "@labo/db/repos/examenes";
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

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } },
): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const examen = await examenesGetById(getAdminDb(), { id: context.params.id });
    if (!examen) {
      return bad(404, "EXAMEN_NO_ENCONTRADO");
    }

    return NextResponse.json(examen);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const examen = await examenesUpdate(getAdminDb(), {
      id: context.params.id,
      nombre: body.nombre as string | undefined,
      precio_usd: body.precio_usd as number | undefined,
      unidad: body.unidad as string | undefined,
      valores_referencia: body.valores_referencia as string | undefined,
      tipo_analisis: body.tipo_analisis as string | undefined,
      metodo: body.metodo as string | undefined,
      observaciones: body.observaciones as string | undefined,
      usuarioId: user.userId,
    });
    return NextResponse.json(examen);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const examen = await examenesDeactivate(getAdminDb(), {
      id: context.params.id,
      usuarioId: user.userId,
    });
    return NextResponse.json(examen);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

export async function POST(
  _request: NextRequest,
  context: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const examen = await examenesActivate(getAdminDb(), {
      id: context.params.id,
      usuarioId: user.userId,
    });
    return NextResponse.json(examen);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
