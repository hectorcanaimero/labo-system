import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";

import { requireRole, AuthError } from "@/lib/server/auth";
import {
  ASSET_TIPO_INVALIDO,
  validateAssetFile,
} from "@labo/lib/schemas/config";
import { saveObject } from "@labo/lib/storage-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireRole("admin");

    const form = await request.formData().catch(() => null);
    if (!form) return bad(400, "VALIDACION_FALLIDA");

    const type = form.get("type");
    const file = form.get("file");

    if (typeof type !== "string" || !(file instanceof File)) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    if (type !== "logo" && type !== "firma" && type !== "sello") {
      return bad(400, ASSET_TIPO_INVALIDO);
    }

    const fileError = validateAssetFile({ type: file.type, size: file.size });
    if (fileError) return bad(400, fileError);

    const extension =
      MIME_TO_EXT[file.type] || file.name.split(".").pop() || "png";
    const uuid = crypto.randomUUID();
    const key = `assets/${type}/${uuid}.${extension}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await saveObject("assets", key, buffer);

    return NextResponse.json({ key, size: file.size, mimeType: file.type });
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
    }
    const message = error instanceof Error ? error.message : "ERROR_GENERICO";
    return bad(500, message);
  }
}
