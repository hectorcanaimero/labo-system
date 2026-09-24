import { NextResponse } from "next/server";

import { deletePendingInvitations } from "@labo/db/repos/usuarios";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `DELETE /api/usuarios/invite/[id]` — revocar una invitación pendiente (Admin only). */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }
    await deletePendingInvitations(getAdminDb(), { id: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    console.error("[invite:DELETE] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
