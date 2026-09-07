import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { getBySlug } from "@labo/db/repos/enlaces";
import { getById as getOrden, RESULTADO_NO_ENCONTRADO } from "@labo/db/repos/ordenes";
import { SLUG_PATTERN } from "@labo/lib/enlace-resultado";
import { getAdminDb } from "@/lib/db-server";

import { pdfResponse, renderResultadoPdf } from "../../../pdf/resultado/[id]/route";

/**
 * PDF del resultado para el enlace público del paciente (`/r/[slug]`).
 *
 * Sin sesión: el slug vigente ES la credencial, igual que la página que lo
 * consume. Responde 404 tanto si el enlace no existe como si venció, para no
 * poder sondear qué órdenes existen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    slug: string;
  };
};

function notFound(): Response {
  return NextResponse.json({ error: "ENLACE_NO_ENCONTRADO" }, { status: 404 });
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<Response> {
  if (!SLUG_PATTERN.test(params.slug)) return notFound();

  const db = getAdminDb();
  const enlace = await getBySlug(db, params.slug);
  if (!enlace) return notFound();

  const orden = await getOrden(db, enlace.orden_id);
  if (!orden || orden.estado === "Anulada") return notFound();

  try {
    const { body, filename } = await renderResultadoPdf(orden.id);
    return pdfResponse(body, filename);
  } catch (error) {
    if (error instanceof Error && error.message === RESULTADO_NO_ENCONTRADO) {
      return notFound();
    }
    console.error("r/[slug]/pdf:", error);
    return NextResponse.json({ error: "ERROR_GENERICO" }, { status: 500 });
  }
}
