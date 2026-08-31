import { NextResponse, type NextRequest } from "next/server";

import { setActivo, updateRole, type UserRole } from "@labo/db/repos/usuarios";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  role?: unknown;
  activo?: unknown;
}

/**
 * `PATCH /api/usuarios/[id]` — cambiar rol y/o estado activo (Admin only, F9).
 *
 * Seguridad: un admin no puede degradarse ni desactivarse a sí mismo (evita
 * quedarse sin ningún admin en el sistema).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body || (body.role === undefined && body.activo === undefined)) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    let nextRole: UserRole | undefined;
    if (body.role !== undefined) {
      if (body.role !== "admin" && body.role !== "operador") {
        return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
      }
      nextRole = body.role;
    }

    let nextActivo: boolean | undefined;
    if (body.activo !== undefined) {
      if (typeof body.activo !== "boolean") {
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      }
      nextActivo = body.activo;
    }

    const isSelf = params.id === user.userId;
    if (isSelf && (nextActivo === false || (nextRole !== undefined && nextRole !== "admin"))) {
      return NextResponse.json(
        { error: "No podés degradar ni desactivar tu propia cuenta." },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    let updated: { id: string; role: UserRole; activo: boolean } | undefined;

    if (nextRole !== undefined) {
      updated = await updateRole(db, params.id, nextRole);
    }
    if (nextActivo !== undefined) {
      updated = await setActivo(db, params.id, nextActivo);
    }

    if (!updated) {
      return NextResponse.json({ error: "USUARIO_NO_ENCONTRADO" }, { status: 404 });
    }

    return NextResponse.json({ usuario: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }
    console.error("[usuarios:PATCH] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
