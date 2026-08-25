import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { requireRole, AUTH_COOKIE_NAMES, AuthError } from "@labo/lib/server/auth";
import {
  ASSET_MIME_INVALIDO,
  ASSET_TAMANO_EXCEDIDO,
  ASSET_NO_ENCONTRADO,
  validateAssetFile,
} from "@labo/lib/schemas/config";
import { getInsforgeClient } from "@labo/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // 1. Verificar rol Admin
    await requireRole("admin");

    // 2. Parsear request body
    const body = (await request.json().catch(() => null)) as {
      key?: string;
      size?: number;
      contentType?: string;
      confirmUrl?: string;
    } | null;

    if (!body || !body.key || body.size === undefined || !body.contentType) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const { key, size, contentType, confirmUrl } = body;

    // 3. Validar MIME y tamaño (defense in depth lado servidor)
    const fileError = validateAssetFile({ type: contentType, size });
    if (fileError) {
      return bad(400, fileError);
    }

    // 4. Si requiere confirmación en InsForge, la llamamos
    if (confirmUrl) {
      let finalConfirmUrl = confirmUrl;
      if (!finalConfirmUrl.startsWith("http")) {
        const baseUrl = (process.env.INSFORGE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL || "").replace(/\/+$/, "");
        finalConfirmUrl = `${baseUrl}${finalConfirmUrl.startsWith("/") ? "" : "/"}${finalConfirmUrl}`;
      }

      const anonKey = process.env.INSFORGE_ANON_KEY || "";
      const confirmRes = await fetch(finalConfirmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          size,
          contentType,
        }),
        cache: "no-store",
      });

      if (!confirmRes.ok) {
        const errText = await confirmRes.text().catch(() => "");
        return bad(400, `Backend confirmation failed: ${confirmRes.statusText}. ${errText}`);
      }
    }

    // 5. Verificar existencia y metadatos reales del objeto en Storage (más seguridad)
    const accessToken = cookies().get(AUTH_COOKIE_NAMES.access)?.value;
    const client = getInsforgeClient(accessToken);
    const { data: listData, error: listError } = await client.storage
      .from("assets")
      .list({ prefix: key });

    if (listError || !listData) {
      return bad(400, ASSET_NO_ENCONTRADO);
    }

    const obj = listData.objects.find((o) => o.key === key);
    if (!obj) {
      return bad(400, ASSET_NO_ENCONTRADO);
    }

    if (obj.size > 2 * 1024 * 1024) {
      return bad(400, ASSET_TAMANO_EXCEDIDO);
    }

    if (!obj.mimeType || !obj.mimeType.startsWith("image/")) {
      return bad(400, ASSET_MIME_INVALIDO);
    }

    // 6. Éxito
    return NextResponse.json({
      success: true,
      key,
      size: obj.size,
      mimeType: obj.mimeType,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
    }
    const message = error instanceof Error ? error.message : "ERROR_GENERICO";
    return bad(500, message);
  }
}
