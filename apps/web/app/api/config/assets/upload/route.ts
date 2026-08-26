import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { requireRole, AUTH_COOKIE_NAMES, AuthError } from "@/lib/server/auth";
import {
  ASSET_TIPO_INVALIDO,
  validateAssetFile,
} from "@labo/lib/schemas/config";
import { getUploadStrategy } from "@labo/lib/storage";

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
      type?: string;
      filename?: string;
      contentType?: string;
      size?: number;
    } | null;

    if (!body || !body.type || !body.filename || !body.contentType || body.size === undefined) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const { type, filename, contentType, size } = body;

    // 3. Validar tipo de asset
    if (type !== "logo" && type !== "firma" && type !== "sello") {
      return bad(400, ASSET_TIPO_INVALIDO);
    }

    // 4. Validar archivo (MIME y tamaño)
    const fileError = validateAssetFile({ type: contentType, size });
    if (fileError) {
      return bad(400, fileError);
    }

    // 5. Generar key del objeto: assets/{tipo}/{uuid}.{ext}
    const mimeToExt: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/gif": "gif",
      "image/svg+xml": "svg",
      "image/webp": "webp",
    };
    const extension = mimeToExt[contentType] || filename.split(".").pop() || "png";
    const uuid = crypto.randomUUID();
    const key = `assets/${type}/${uuid}.${extension}`;

    // 6. Pedir la upload strategy a InsForge
    const accessToken = cookies().get(AUTH_COOKIE_NAMES.access)?.value;
    const strategy = await getUploadStrategy(
      "assets",
      key,
      contentType,
      size,
      accessToken
    );

    // 7. Retornar la estrategia y la key generada
    return NextResponse.json({
      strategy,
      key,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
    }
    const message = error instanceof Error ? error.message : "ERROR_GENERICO";
    return bad(500, message);
  }
}
