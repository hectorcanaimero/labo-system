import { NextResponse, type NextRequest } from "next/server";
import { delete as deletePresupuesto, getById, update, cambiarEstado } from "@labo/db/repos/presupuestos";
import { AuthError, getCurrentUser, requireRole } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(error: unknown): Response {
  if (error instanceof AuthError) return NextResponse.json({ error: error.code }, { status: error.code === "UNAUTHENTICATED" ? 401 : 403 });
  const code = error instanceof Error ? error.message : "ERROR_GENERICO";
  const status = ["PRESUPUESTO_NO_ENCONTRADO"].includes(code) ? 404 : ["PRESUPUESTO_NO_BORRADOR", "ESTADO_SOLO_UPDATE_ESTADO", "ESTADO_INVALIDO", "MOTIVO_RECHAZO_REQUERIDO", "TRANSICION_ESTADO_INVALIDA", "PACIENTE_XOR_REQUIRED", "VALIDACION_FALLIDA", "EXAMEN_NO_ENCONTRADO"].includes(code) ? 400 : 500;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(_request: NextRequest, context: { params: { id: string } }): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") throw new AuthError("UNAUTHORIZED");
    const item = await getById(context.params.id);
    return item ? NextResponse.json(item) : NextResponse.json({ error: "PRESUPUESTO_NO_ENCONTRADO" }, { status: 404 });
  } catch (error) { return response(error); }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") throw new AuthError("UNAUTHORIZED");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "VALIDACION_FALLIDA" }, { status: 400 });
    if (body.estado !== undefined) {
      return NextResponse.json(await cambiarEstado(
        context.params.id,
        body.estado,
        typeof body.motivo_rechazo === "string" ? body.motivo_rechazo : undefined,
        user.userId,
      ));
    }
    return NextResponse.json(await update(context.params.id, body, user.userId));
  } catch (error) { return response(error); }
}

export async function DELETE(_request: NextRequest, context: { params: { id: string } }): Promise<Response> {
  try {
    const user = await requireRole("admin");
    return NextResponse.json(await deletePresupuesto(context.params.id, user.userId));
  } catch (error) { return response(error); }
}
