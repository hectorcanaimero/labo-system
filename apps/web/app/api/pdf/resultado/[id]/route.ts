import "server-only";

import { Readable } from "node:stream";

import { getForPDF, RESULTADO_NO_ENCONTRADO } from "@labo/db/repos/resultados";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import ResultadoPDF from "@labo/pdf/ResultadoPDF";
import { renderToStream, type DocumentProps } from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { createElement, type ReactElement } from "react";

import { crearOReutilizarVerificacion, VERIFICACION_TABLA_FALTANTE } from "@labo/db/repos/enlaces";
import { resolvePdfAsset } from "@/lib/pdf-assets";
import { getAdminDb, getDb } from "@/lib/db-server";
import { publicOrigin } from "@/lib/public-origin";

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
 * Deja rastro en `audit_log` de un error inesperado al crear el enlace de
 * verificación (best-effort: si esto también falla, no debe tumbar el PDF).
 */
async function auditarVerificacionError(
  db: ReturnType<typeof getAdminDb>,
  ordenId: string,
  message: string,
): Promise<void> {
  try {
    await db.from("audit_log").insert({
      accion: "pdf.verificacion_error",
      entity_type: "ordenes",
      entity_id: ordenId,
      metadata: { message },
    });
  } catch (err) {
    console.error("audit_log pdf.verificacion_error failed:", err);
  }
}

/**
 * URL del QR de verificación. Reutiliza el enlace de la orden y lo crea si no
 * existe, para que un PDF regenerado conserve el mismo slug y el QR de una
 * copia impresa siga coincidiendo con el de la copia digital.
 *
 * Best-effort SOLO para `VERIFICACION_TABLA_FALTANTE` (la 0016 no está
 * aplicada): el informe sale sin QR en vez de no emitirse. Cualquier otro
 * error antes se perdía en un `console.warn` sin dejar rastro (revisión
 * cruzada F7.3.T5) — ahora queda en `audit_log`, pero tampoco tumba el PDF.
 */
async function resolverVerificacionUrl(
  db: ReturnType<typeof getAdminDb>,
  ordenId: string,
  origin: string,
): Promise<string | null> {
  try {
    const enlace = await crearOReutilizarVerificacion(db, ordenId);
    return `${origin}/v/${enlace.slug}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === VERIFICACION_TABLA_FALTANTE) {
      console.warn("[pdf/resultado] sin QR de verificación (tabla 0016 sin aplicar)");
      return null;
    }
    console.error("[pdf/resultado] error inesperado creando el enlace de verificación", message);
    await auditarVerificacionError(db, ordenId, message);
    return null;
  }
}

/**
 * Renderiza el PDF de una orden. Compartido entre esta ruta (staff, con
 * sesión) y `api/r/[slug]/pdf` (público, autorizado por slug vigente) para no
 * duplicar la carga de assets ni el armado del documento.
 *
 * `origin` es el origen público con el que se arma la URL del QR; sin él el
 * informe sale sin QR.
 */
export async function renderResultadoPdf(
  ordenId: string,
  origin?: string,
): Promise<{ body: ReadableStream<Uint8Array>; filename: string }> {
  const db = getAdminDb();
  const data = await getForPDF(db, ordenId, resolvePdfAsset);
  if (!data) {
    throw new Error(RESULTADO_NO_ENCONTRADO);
  }

  assertPdfConfig(data.config?.nombre);

  // El QR confirma que "este informe salió del laboratorio": no tiene sentido
  // para una orden que todavía no se entregó, y crear el enlace antes de
  // tiempo dejaría un slug de verificación permanente para un informe que
  // puede cambiar (F7.3.T5).
  const verificacionUrl =
    origin && data.estado === "Entregada"
      ? await resolverVerificacionUrl(db, ordenId, origin)
      : null;

  // Afirmación solo en el límite del renderer: las props ya están chequeadas
  // por createElement(ResultadoPDF, { data }) contra ResultadoPDFProps.
  const element = createElement(ResultadoPDF, {
    data: { ...data, verificacion_url: verificacionUrl },
  }) as ReactElement<DocumentProps>;
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

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const startedAt = performance.now();

  try {
    getDb();
    await requirePdfAccess();

    if (!isUuid(params.id)) {
      return bad(400, "VALIDACION_FALLIDA");
    }

    const { body, filename } = await renderResultadoPdf(params.id, publicOrigin(request));
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
