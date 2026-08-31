import "server-only";

import { Readable } from "node:stream";

import { getForPDF, RESULTADO_NO_ENCONTRADO } from "@labo/db/repos/resultados";
import { readObject } from "@labo/lib/storage-local";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import ResultadoPDF from "@labo/pdf/ResultadoPDF";
import { renderToStream, type DocumentProps } from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { createElement, type ReactElement } from "react";

import { pdfAssetCache } from "@/lib/asset-cache";
import { getAdminDb, getDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET_BUCKET = "assets";
const LAB_NAME_REQUIRED = "NOMBRE_LABORATORIO_REQUERIDO";

// PNG 1×1 transparente: fallback para que el PDF siga renderizando si un asset
// (logo/firma/sello) no puede descargarse (bloqueo de red, objeto borrado, etc).
const EMBEDDED_TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
};

function mimeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "image/png";
}

type RouteParams = {
  params: {
    id: string;
  };
};

function bad(status: number, error: string, message?: string): Response {
  return NextResponse.json(message ? { error, message } : { error }, { status });
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function requirePdfAccess() {
  const user = await getCurrentUser();
  if (user.role !== "admin" && user.role !== "operador") {
    throw new AuthError("UNAUTHORIZED");
  }
  return user;
}

/**
 * Descarga el asset desde su URL firmada/pública y lo embebe como data URI
 * (base64), de modo que `@react-pdf/renderer` no tenga que resolver la URL en
 * tiempo de render (evita bloqueos de red y reintentos dentro del renderizador).
 */
async function resolveAssetDataUri(objectKey: string): Promise<string> {
  return pdfAssetCache.getOrSet(objectKey, async () => {
    const buf = await readObject(ASSET_BUCKET, objectKey);
    if (buf.byteLength > MAX_ASSET_BYTES) {
      throw new Error(`Asset exceeds ${MAX_ASSET_BYTES} bytes`);
    }
    return `data:${mimeForKey(objectKey)};base64,${buf.toString("base64")}`;
  });
}

/**
 * Resuelve un asset a data URI sin romper la generación del PDF: si la descarga
 * falla, degrada a un PNG transparente (el documento se emite igual, sin el
 * asset). Contrato: `AssetUrlResolver` retorna `Promise<string>`.
 */
async function resolveAssetUrl(objectKey: string): Promise<string> {
  try {
    return await resolveAssetDataUri(objectKey);
  } catch (error) {
    console.error(`[pdf:resultado] No se pudo embeber el asset "${objectKey}":`, error);
    return EMBEDDED_TRANSPARENT_PNG;
  }
}

function assertPdfConfig(nombre: string | null | undefined): void {
  if (typeof nombre === "string" && nombre.trim().length > 0) return;
  throw new Error(LAB_NAME_REQUIRED);
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
  }

  const code = error instanceof Error ? error.message : "ERROR_GENERICO";

  if (code === RESULTADO_NO_ENCONTRADO) {
    return bad(404, code);
  }

  if (code === LAB_NAME_REQUIRED) {
    return bad(
      403,
      code,
      "El nombre del laboratorio es obligatorio para generar el PDF del resultado.",
    );
  }

  return bad(500, "ERROR_GENERICO");
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<Response> {
  const startedAt = performance.now();

  try {
    getDb();
    await requirePdfAccess();

    if (!isUuid(params.id)) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const data = await getForPDF(getAdminDb(), params.id, resolveAssetUrl);
    if (!data) {
      return bad(404, RESULTADO_NO_ENCONTRADO);
    }

    assertPdfConfig(data.config?.nombre);

    // Afirmación solo en el límite del renderer: las props ya están chequeadas
    // por createElement(ResultadoPDF, { data }) contra ResultadoPDFProps.
    const element = createElement(ResultadoPDF, { data }) as ReactElement<DocumentProps>;
    const stream = await renderToStream(element);
    const body = Readable.toWeb(stream as unknown as Readable) as ReadableStream<Uint8Array>;
    const filename = `resultado-${params.id}.pdf`;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    console.info("pdf_render_duration_ms", {
      duration_ms: durationMs,
      kind: "resultado",
      resultado_id: params.id,
    });
  }
}
