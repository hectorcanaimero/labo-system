import { NextResponse } from "next/server";

import { listAll } from "@labo/db/repos/usuarios";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/usuarios` — listado de usuarios (Admin only, F9).
 */
export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }

    const usuarios = await listAll(getAdminDb());

    return NextResponse.json({ usuarios });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }
    console.error("[usuarios:GET] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
