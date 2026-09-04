import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";

import {
  objectExists,
  openReadStream,
  verifyDownloadToken,
  type BucketName,
} from "@labo/lib/storage-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = new Set<BucketName>(["assets", "exports"]);

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
};

function guessContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  { params }: { params: { bucket: string; path: string[] } },
): Promise<Response> {
  const bucket = params.bucket as BucketName;
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return new NextResponse("Bucket inválido", { status: 404 });
  }

  const key = params.path.map(decodeURIComponent).join("/");
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const exp = Number(url.searchParams.get("exp") ?? "0");

  if (!verifyDownloadToken(bucket, key, token, exp)) {
    return new NextResponse("Token inválido o expirado", { status: 403 });
  }

  const info = await objectExists(bucket, key);
  if (!info) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const nodeStream = openReadStream(bucket, key) as unknown as Readable;
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": guessContentType(key),
      "Content-Length": String(info.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
