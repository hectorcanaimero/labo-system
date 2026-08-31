import { NextResponse, type NextRequest } from "next/server";

import { deactivate, getById, update } from "@labo/db/repos/pacientes";
import { getDb } from "@/lib/db-server";
import { AuthError, getCurrentUser } from "@/lib/server/auth";

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
    case "PACIENTE_NO_ENCONTRADO":
      return { status: 404, error: code };
    case "CEDULA_DUPLICADA":
    case "PACIENTE_TIENE_HISTORIAL":
      return { status: 409, error: code };
    case "CEDULA_INVALIDA":
    case "VALIDACION_FALLIDA":
    case "NOMBRE_REQUERIDO":
    case "APELLIDO_REQUERIDO":
    case "FECHA_NACIMIENTO_FUTURA":
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

    const paciente = await getById(getDb(), context.params.id);
    if (!paciente) {
      return bad(404, "PACIENTE_NO_ENCONTRADO");
    }

    return NextResponse.json(paciente);
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
    await requireOperadorMinimo();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const paciente = await update(getDb(), context.params.id, body);
    return NextResponse.json(paciente);
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
    await requireOperadorMinimo();

    const result = await deactivate(getDb(), context.params.id);
    return NextResponse.json(result);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
