import { NextResponse, type NextRequest } from "next/server";

import { get as getConfig } from "@labo/db/repos/config";
import { crearOReutilizar } from "@labo/db/repos/enlaces";
import { getById as getPacienteById } from "@labo/db/repos/pacientes";
import { getById as getOrden } from "@labo/db/repos/ordenes";
import {
  asuntoEmail,
  enlaceWhatsApp,
  htmlEmail,
  mensajeWhatsApp,
  normalizarTelefonoWhatsApp,
} from "@labo/lib/enlace-resultado";
import { sendEmail } from "@labo/lib/server/email";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

/**
 * POST /api/resultados/{id}/enviar — comparte el resultado con el paciente
 * (GUR-18).
 *
 * Crea (o reutiliza) el enlace corto público `/r/{slug}` y:
 *   - `canal: "whatsapp"` → devuelve el link `wa.me` con el mensaje precargado;
 *     el envío lo dispara el operador desde su propio WhatsApp.
 *   - `canal: "email"` → envía el correo server-side vía `@labo/lib/server/email`.
 *
 * No expone datos clínicos en la respuesta: sólo la URL y el canal.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CANALES = ["whatsapp", "email"] as const;
type Canal = (typeof CANALES)[number];

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

/**
 * Origen público de la app. En el VPS corre detrás de Traefik, así que
 * `request.url` trae el host interno del container: hay que mirar los headers
 * `x-forwarded-*`. `NEXT_PUBLIC_APP_URL` lo pisa todo si está definida.
 */
function publicOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  return `${proto}://${host}`;
}

function formatVencimiento(iso: string): string {
  return new Intl.DateTimeFormat("es-VE", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(iso),
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") throw new AuthError("UNAUTHORIZED");
    if (!UUID_PATTERN.test(params.id)) return bad(400, "VALIDACION_FALLIDA");

    const body = (await request.json().catch(() => null)) as { canal?: unknown } | null;
    const canal = body?.canal;
    if (typeof canal !== "string" || !CANALES.includes(canal as Canal)) {
      return bad(400, "CANAL_INVALIDO");
    }

    const db = getAdminDb();
    const orden = await getOrden(db, params.id);
    if (!orden) return bad(404, "ORDEN_NO_ENCONTRADA");

    const paciente = await getPacienteById(db, orden.paciente_id);
    if (!paciente) return bad(404, "PACIENTE_NO_ENCONTRADO");

    const telefono = normalizarTelefonoWhatsApp(paciente.telefono);
    const email = paciente.email?.trim() || null;
    if (canal === "whatsapp" && !telefono) return bad(400, "PACIENTE_SIN_TELEFONO");
    if (canal === "email" && !email) return bad(400, "PACIENTE_SIN_EMAIL");

    const config = await getConfig(db);
    const laboratorio = config?.nombre?.trim() || "el laboratorio";

    const enlace = await crearOReutilizar(db, orden.id, user.userId);
    const url = `${publicOrigin(request)}/r/${enlace.slug}`;
    const mensaje = {
      paciente: paciente.nombre,
      laboratorio,
      url,
      vence: formatVencimiento(enlace.expira_en),
    };

    if (canal === "whatsapp") {
      return NextResponse.json({
        canal,
        url,
        whatsappUrl: enlaceWhatsApp(telefono as string, mensajeWhatsApp(mensaje)),
      });
    }

    await sendEmail({
      to: email as string,
      subject: asuntoEmail(laboratorio),
      html: htmlEmail(mensaje),
    });

    return NextResponse.json({ canal, url, enviadoA: email });
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
    }
    console.error("[POST /api/resultados/[id]/enviar]", error);
    return bad(500, "ERROR_GENERICO");
  }
}
