import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, AUTH_COOKIE_NAMES, AuthError } from "@/lib/server/auth";
import { ASSET_TIPO_INVALIDO } from "@labo/lib/schemas/config";
import { get } from "@labo/db/repos/config";
import { createSignedDownloadUrl } from "@labo/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // 1. Verificar autenticación (cualquier rol)
    await getCurrentUser();

    // 2. Obtener parámetro 'type' de la query
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type || (type !== "logo" && type !== "firma" && type !== "sello")) {
      return bad(400, ASSET_TIPO_INVALIDO);
    }

    // 3. Buscar configuración
    const config = await get();
    if (!config) {
      return NextResponse.json({ url: null });
    }

    const objectKey = config[`${type}_object_key` as const];
    if (!objectKey) {
      return NextResponse.json({ url: null });
    }

    // 4. Generar URL firmada válida por 1 hora (3600 segundos)
    const accessToken = cookies().get(AUTH_COOKIE_NAMES.access)?.value;
    const signedUrl = await createSignedDownloadUrl("assets", objectKey, 3600, accessToken);

    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
    }
    const message = error instanceof Error ? error.message : "ERROR_GENERICO";
    return bad(500, message);
  }
}
