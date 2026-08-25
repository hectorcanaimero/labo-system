import { NextResponse, type NextRequest } from "next/server";

import { titulosDelete, titulosUpdate } from "@labo/db/repos/examenes";
import { AuthError, requireRole } from "@labo/lib/server/auth";

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
    case "TITULO_NO_ENCONTRADO":
      return { status: 404, error: code };
    case "TITULO_DUPLICADO":
    case "TITULO_TIENE_EXAMENES":
      return { status: 409, error: code };
    case "VALIDACION_FALLIDA":
      return { status: 400, error: code };
    default:
      return { status: 500, error: "ERROR_GENERICO" };
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

    const titulo = await titulosUpdate({
      id: context.params.id,
      nombre: body.nombre as string | undefined,
      orden: body.orden as number | undefined,
      usuarioId: user.userId,
    });
    return NextResponse.json(titulo);
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

    const titulo = await titulosDelete({
      id: context.params.id,
      usuarioId: user.userId,
    });
    return NextResponse.json(titulo);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
