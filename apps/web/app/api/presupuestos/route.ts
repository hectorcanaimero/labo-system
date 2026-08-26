import { NextResponse, type NextRequest } from "next/server";
import { create, list, search } from "@labo/db/repos/presupuestos";
import { AuthError, getCurrentUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(error: unknown): Response {
  if (error instanceof AuthError) return NextResponse.json({ error: error.code }, { status: error.code === "UNAUTHENTICATED" ? 401 : 403 });
  const code = error instanceof Error ? error.message : "ERROR_GENERICO";
  const status = code === "PRESUPUESTO_NO_ENCONTRADO" ? 404 : code === "EXAMEN_NO_ENCONTRADO" ? 404 : code === "PACIENTE_XOR_REQUIRED" ? 400 : code === "CREATED_BY_REQUERIDO" ? 500 : code === "VALIDACION_FALLIDA" ? 400 : 500;
  return NextResponse.json({ error: code === "CREATED_BY_REQUERIDO" ? "ERROR_GENERICO" : code }, { status });
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") throw new AuthError("UNAUTHORIZED");
    const params = request.nextUrl.searchParams;
    const term = params.get("term")?.trim();
    if (term) return NextResponse.json(await search({ term }));
    const page = Number(params.get("page") ?? 1);
    const limit = Number(params.get("limit") ?? 20);
    return NextResponse.json(await list({ page, limit, filters: {
      paciente_id: params.get("paciente_id") ?? undefined,
      estado: (params.get("estado") as "Borrador" | "Aprobado" | "Convertido" | null) ?? undefined,
      desde: params.get("desde") ?? undefined,
      hasta: params.get("hasta") ?? undefined,
    } }));
  } catch (error) { return response(error); }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") throw new AuthError("UNAUTHORIZED");
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "VALIDACION_FALLIDA" }, { status: 400 });
    return NextResponse.json(await create(body, user.userId), { status: 201 });
  } catch (error) { return response(error); }
}
