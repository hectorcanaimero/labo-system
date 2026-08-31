import { NextResponse, type NextRequest } from "next/server";

import {
  EXAMEN_NO_ENCONTRADO,
  getExamenes,
  PAQUETE_NO_ENCONTRADO,
  setExamenes,
} from "@labo/db/repos/paquetes";
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
    case PAQUETE_NO_ENCONTRADO:
    case EXAMEN_NO_ENCONTRADO:
      return { status: 404, error: code };
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
    return NextResponse.json(await getExamenes(getAdminDb(), context.params.id));
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { id: string } },
): Promise<Response> {
  try {
    await requireRole("admin");

    const body = (await request.json().catch(() => null)) as
      | { examenIds?: unknown }
      | null;
    if (!body || !("examenIds" in body)) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    return NextResponse.json(
      await setExamenes(getAdminDb(), context.params.id, body.examenIds),
    );
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
