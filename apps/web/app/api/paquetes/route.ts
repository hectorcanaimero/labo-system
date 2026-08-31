import { NextResponse, type NextRequest } from "next/server";

import { create, list, PAQUETE_DUPLICADO } from "@labo/db/repos/paquetes";
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
    case PAQUETE_DUPLICADO:
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
    return NextResponse.json(await list(getAdminDb()));
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireRole("admin");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const paquete = await create(getAdminDb(), body);
    return NextResponse.json(paquete, { status: 201 });
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
