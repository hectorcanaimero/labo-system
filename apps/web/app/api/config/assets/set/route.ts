import { NextResponse, type NextRequest } from "next/server";

import { requireRole, AuthError } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";
import { ASSET_TIPO_INVALIDO } from "@labo/lib/schemas/config";
import { get, updateAssetKey } from "@labo/db/repos/config";
import { deleteObject } from "@labo/lib/storage-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // 1. Verificar rol Admin
    const user = await requireRole("admin");

    // 2. Parsear request body
    const body = (await request.json().catch(() => null)) as {
      type?: string;
      key?: string | null;
    } | null;

    if (!body || !body.type || body.key === undefined) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const { type, key } = body;

    // 3. Validar tipo de asset
    if (type !== "logo" && type !== "firma" && type !== "sello") {
      return bad(400, ASSET_TIPO_INVALIDO);
    }

    // 4. Obtener configuración actual para identificar si hay un reemplazo de asset
    const db = getAdminDb();
    const currentConfig = await get(db);
    const oldKey = currentConfig ? currentConfig[`${type}_object_key` as const] : null;

    if (oldKey && oldKey !== key) {
      try {
        await deleteObject("assets", oldKey);
      } catch (delError) {
        console.error(`[assets/set] Error deleting old object ${oldKey}:`, delError);
      }
    }

    const updatedConfig = await updateAssetKey(db, type as "logo" | "firma" | "sello", key, user.userId);

    // 7. Retornar configuración actualizada
    return NextResponse.json(updatedConfig);
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
    }
    const message = error instanceof Error ? error.message : "ERROR_GENERICO";
    return bad(500, message);
  }
}
