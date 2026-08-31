import { NextResponse, type NextRequest } from "next/server";

import {
  PAQUETE_NO_ENCONTRADO,
  TITULO_NO_ENCONTRADO,
  setTitulos,
} from "@labo/db/repos/paquetes";
import { AuthError, requireRole } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

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
    case PAQUETE_NO_ENCONTRADO:
    case TITULO_NO_ENCONTRADO:
      return { status: 404, error: code };
    case "VALIDACION_FALLIDA":
      return { status: 400, error: code };
    default:
      return { status: 500, error: "ERROR_GENERICO" };
  }
}

/**
 * PUT /api/paquetes/[id]/titulos — reemplaza el set de grupos (títulos)
 * incluidos por referencia dinámica en el paquete.
 *
 * Body: { tituloIds: string[] }
 */
export async function PUT(
  request: NextRequest,
  context: { params: { id: string } },
): Promise<Response> {
  try {
    await requireRole("admin");

    const body = (await request.json().catch(() => null)) as
      | { tituloIds?: unknown }
      | null;
    if (!body || !("tituloIds" in body)) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    return NextResponse.json(
      await setTitulos(getAdminDb(), context.params.id, body.tituloIds),
    );
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
