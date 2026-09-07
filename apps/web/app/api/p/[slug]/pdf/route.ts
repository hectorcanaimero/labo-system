import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { getPresupuestoBySlug } from "@labo/db/repos/enlaces";
import { getById as getPresupuesto, PRESUPUESTO_NO_ENCONTRADO } from "@labo/db/repos/presupuestos";
import { SLUG_PATTERN } from "@labo/lib/enlace-resultado";
import { getAdminDb } from "@/lib/db-server";

import { pdfResponse, renderPresupuestoPdf } from "../../../pdf/presupuesto/[id]/route";

/**
 * PDF del presupuesto para el enlace público del paciente (`/p/[slug]`),
 * espejo de `/api/r/[slug]/pdf` (F7.2.T7).
 *
 * Sin sesión: el slug vigente ES la credencial, igual que la página que lo
 * consume. Responde 404 si el enlace no existe, venció, o el presupuesto se
 * canceló — para no poder sondear qué presupuestos existen.
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
  const enlace = await getPresupuestoBySlug(db, params.slug);
  if (!enlace) return notFound();

  const presupuesto = await getPresupuesto(db, enlace.presupuesto_id);
  if (!presupuesto || presupuesto.estado === "Cancelado") return notFound();

  try {
    const { body, filename } = await renderPresupuestoPdf(presupuesto.id);
    return pdfResponse(body, filename);
  } catch (error) {
    if (error instanceof Error && error.message === PRESUPUESTO_NO_ENCONTRADO) {
      return notFound();
    }
    console.error("p/[slug]/pdf:", error);
    return NextResponse.json({ error: "ERROR_GENERICO" }, { status: 500 });
  }
}
