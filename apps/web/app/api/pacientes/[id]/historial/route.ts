import { NextResponse, type NextRequest } from "next/server";

import {
  PACIENTE_NO_ENCONTRADO,
  pacientesGetWithHistorial,
} from "@labo/db/repos/pacientes";
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

function parsePositiveInt(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("VALIDACION_FALLIDA");
  }

  return parsed;
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
    case PACIENTE_NO_ENCONTRADO:
      return { status: 404, error: code };
    case "VALIDACION_FALLIDA":
      return { status: 400, error: code };
    default:
      return { status: 500, error: "ERROR_GENERICO" };
  }
}

export async function GET(
  request: NextRequest,
  context: { params: { id: string } },
): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const resultadosLimit = parsePositiveInt(
      request.nextUrl.searchParams.get("resultadosLimit"),
    );
    const presupuestosLimit = parsePositiveInt(
      request.nextUrl.searchParams.get("presupuestosLimit"),
    );

    const historial = await pacientesGetWithHistorial({
      id: context.params.id,
      resultadosLimit,
      presupuestosLimit,
    });

    return NextResponse.json(historial);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
