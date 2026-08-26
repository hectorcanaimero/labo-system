import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { requireRole, AUTH_COOKIE_NAMES, AuthError } from "@/lib/server/auth";
import { ASSET_TIPO_INVALIDO } from "@labo/lib/schemas/config";
import { get, updateAssetKey } from "@labo/db/repos/config";
import { deleteObject } from "@labo/lib/storage";

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
    const currentConfig = await get();
    const oldKey = currentConfig ? currentConfig[`${type}_object_key` as const] : null;

    const accessToken = cookies().get(AUTH_COOKIE_NAMES.access)?.value;

    // 5. Si hay un asset anterior y es distinto del nuevo, borrarlo de Storage
    if (oldKey && oldKey !== key) {
      try {
        await deleteObject("assets", oldKey, accessToken);
      } catch (delError) {
        // Logueamos pero no bloqueamos el update de la base de datos si falla por borrado
        console.error(`[assets/set] Error deleting old object ${oldKey} from storage:`, delError);
      }
    }

    // 6. Actualizar la clave en la base de datos (laboratorio_config)
    const updatedConfig = await updateAssetKey(type as "logo" | "firma" | "sello", key, user.userId);

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
