import { NextResponse, type NextRequest } from "next/server";

import { pacientesSearch } from "@labo/db/repos/pacientes";
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
    case "VALIDACION_FALLIDA":
      return { status: 400, error: code };
    default:
      return { status: 500, error: "ERROR_GENERICO" };
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const term = request.nextUrl.searchParams.get("term")?.trim() ?? "";
    const items = await pacientesSearch({ term });

    return NextResponse.json(items);
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
