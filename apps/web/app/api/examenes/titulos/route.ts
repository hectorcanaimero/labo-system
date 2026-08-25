import { NextResponse, type NextRequest } from "next/server";

import { titulosCreate, titulosList, titulosReorder } from "@labo/db/repos/examenes";
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

export async function GET(): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const titulos = await titulosList();
    return NextResponse.json(titulos);
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

    const titulo = await titulosCreate({
      nombre: body.nombre as string,
      orden: body.orden as number,
      usuarioId: user.userId,
    });
    return NextResponse.json(titulo, { status: 201 });
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.orderedIds)) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const orderedIds = await titulosReorder({
      orderedIds: body.orderedIds as string[],
      usuarioId: user.userId,
    });
    return NextResponse.json({ orderedIds });
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
