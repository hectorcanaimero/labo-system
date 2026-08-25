import { NextResponse, type NextRequest } from "next/server";
import { getKPIs, getResultadosPorMes, getRecentActivity } from "@labo/db/repos/dashboard";
import { AuthError, getCurrentUser } from "@labo/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

async function requireOperadorMinimo(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "operador")) {
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
  return { status: 500, error: "ERROR_GENERICO" };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const url = new URL(request.url);
    const months = parseInt(url.searchParams.get("months") ?? "6", 10);
    const limit = parseInt(url.searchParams.get("limit") ?? "5", 10);

    const [kpis, resultadosPorMes, activity] = await Promise.all([
      getKPIs(),
      getResultadosPorMes(months),
      getRecentActivity(limit)
    ]);

    return NextResponse.json({ kpis, resultadosPorMes, activity });
  } catch (error) {
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
