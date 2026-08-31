import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser, AuthError } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";
import { ASSET_TIPO_INVALIDO } from "@labo/lib/schemas/config";
import { get } from "@labo/db/repos/config";
import { signDownloadUrl } from "@labo/lib/storage-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await getCurrentUser();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type || (type !== "logo" && type !== "firma" && type !== "sello")) {
      return bad(400, ASSET_TIPO_INVALIDO);
    }

    const config = await get(getAdminDb());
    if (!config) return NextResponse.json({ url: null });

    const objectKey = config[`${type}_object_key` as const];
    if (!objectKey) return NextResponse.json({ url: null });

    const signedUrl = signDownloadUrl({
      bucket: "assets",
      key: objectKey,
      expiresInSeconds: 3600,
    });

    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
    }
    const message = error instanceof Error ? error.message : "ERROR_GENERICO";
    return bad(500, message);
  }
}
