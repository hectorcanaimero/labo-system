import { NextResponse, type NextRequest } from "next/server";

import { create, list } from "@labo/db/repos/pacientes";
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
    case "CEDULA_DUPLICADA":
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

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const page = parsePositiveInt(request.nextUrl.searchParams.get("page"), 1);
    const limit = parsePositiveInt(request.nextUrl.searchParams.get("limit"), 20);

    const result = await list({ page, limit });
    return NextResponse.json(result);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const paciente = await create(body);
    return NextResponse.json(paciente, { status: 201 });
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
