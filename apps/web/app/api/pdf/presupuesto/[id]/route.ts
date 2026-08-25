import "server-only";

import { Readable } from "node:stream";

import {
  PRESUPUESTO_NO_ENCONTRADO,
  getForPDF,
} from "@labo/db/repos/presupuestos";
import { get as getLaboratorioConfig } from "@labo/db/repos/config";
import { createSignedDownloadUrl } from "@labo/lib/storage";
import { AuthError, getCurrentUser } from "@labo/lib/server/auth";
import PresupuestoPDF from "@labo/pdf/PresupuestoPDF";
import { renderToStream } from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { createElement } from "react";

import { pdfAssetCache } from "@/lib/asset-cache";
import { getDb, getSessionAccessToken } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET_BUCKET = "assets";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
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

async function resolveAssetUrl(objectKey: string): Promise<string> {
  return pdfAssetCache.getOrSet(objectKey, async () => {
    const accessToken = getSessionAccessToken();
    return createSignedDownloadUrl(
      ASSET_BUCKET,
      objectKey,
      SIGNED_URL_TTL_SECONDS,
      accessToken ?? undefined,
    );
  });
}

function assertPdfConfig(nombre: string | null | undefined): void {
  if (typeof nombre === "string" && nombre.trim().length > 0) return;
  throw new Error(LAB_NAME_REQUIRED);
}

async function resolvePdfConfig() {
  const config = await getLaboratorioConfig();
  if (!config) {
    return null;
  }

  const resolve = async (key: string | null): Promise<string | null> => {
    if (!key) return null;
    return resolveAssetUrl(key);
  };

  const [logo_url, firma_url, sello_url] = await Promise.all([
    resolve(config.logo_object_key),
    resolve(config.firma_object_key),
    resolve(config.sello_object_key),
  ]);

  return {
    nombre: config.nombre,
    direccion: config.direccion,
    rif: config.rif,
    logo_url,
    firma_url,
    sello_url,
    pdf_pie_pagina: config.pdf_pie_pagina,
  };
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
  }

  const code = error instanceof Error ? error.message : "ERROR_GENERICO";

  if (code === PRESUPUESTO_NO_ENCONTRADO) {
    return bad(404, code);
  }

  if (code === LAB_NAME_REQUIRED) {
    return bad(
      403,
      code,
      "El nombre del laboratorio es obligatorio para generar el PDF del presupuesto.",
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

    const data = await getForPDF(params.id);
    if (!data) {
      return bad(404, PRESUPUESTO_NO_ENCONTRADO);
    }

    const config = await resolvePdfConfig();
    assertPdfConfig(config?.nombre);

    const stream = await renderToStream(
      createElement(PresupuestoPDF, {
        data: {
          ...data,
          config,
        },
      }) as any
    );
    const body = Readable.toWeb(stream as unknown as Readable) as ReadableStream<Uint8Array>;
    const filename = `presupuesto-${params.id}.pdf`;

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
      kind: "presupuesto",
      presupuesto_id: params.id,
    });
  }
}
