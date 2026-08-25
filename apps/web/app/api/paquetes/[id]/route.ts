import { NextResponse, type NextRequest } from "next/server";

import {
  delete as deletePaquete,
  getById,
  PAQUETE_DUPLICADO,
  PAQUETE_NO_ENCONTRADO,
  update,
} from "@labo/db/repos/paquetes";
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
    case PAQUETE_NO_ENCONTRADO:
      return { status: 404, error: code };
    case PAQUETE_DUPLICADO:
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

    const paquete = await getById(context.params.id);
    if (!paquete) {
      return bad(404, PAQUETE_NO_ENCONTRADO);
    }

    return NextResponse.json(paquete);
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
    await requireRole("admin");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const paquete = await update(context.params.id, body);
    return NextResponse.json(paquete);
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
    await requireRole("admin");
    return NextResponse.json(await deletePaquete(context.params.id));
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
