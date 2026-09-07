import "server-only";

import { Readable } from "node:stream";

import { getForPDF, RESULTADO_NO_ENCONTRADO } from "@labo/db/repos/resultados";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import ResultadoPDF from "@labo/pdf/ResultadoPDF";
import { renderToStream, type DocumentProps } from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { createElement, type ReactElement } from "react";

import { resolvePdfAsset } from "@/lib/pdf-assets";
import { getAdminDb, getDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LAB_NAME_REQUIRED = "NOMBRE_LABORATORIO_REQUERIDO";

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

/**
 * Renderiza el PDF de una orden. Compartido entre esta ruta (staff, con
 * sesión) y `api/r/[slug]/pdf` (público, autorizado por slug vigente) para no
 * duplicar la carga de assets ni el armado del documento.
 */
export async function renderResultadoPdf(
  ordenId: string,
): Promise<{ body: ReadableStream<Uint8Array>; filename: string }> {
  const data = await getForPDF(getAdminDb(), ordenId, resolvePdfAsset);
  if (!data) {
    throw new Error(RESULTADO_NO_ENCONTRADO);
  }

  assertPdfConfig(data.config?.nombre);

  // Afirmación solo en el límite del renderer: las props ya están chequeadas
  // por createElement(ResultadoPDF, { data }) contra ResultadoPDFProps.
  const element = createElement(ResultadoPDF, { data }) as ReactElement<DocumentProps>;
  const stream = await renderToStream(element);
  const body = Readable.toWeb(stream as unknown as Readable) as ReadableStream<Uint8Array>;

  return { body, filename: `resultado-${ordenId}.pdf` };
}

export function pdfResponse(body: ReadableStream<Uint8Array>, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<Response> {
  const startedAt = performance.now();

  try {
    getDb();
    await requirePdfAccess();

    if (!isUuid(params.id)) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const { body, filename } = await renderResultadoPdf(params.id);
    return pdfResponse(body, filename);
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
