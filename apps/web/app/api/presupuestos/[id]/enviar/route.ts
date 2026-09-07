import { NextResponse, type NextRequest } from "next/server";

import { get as getConfig } from "@labo/db/repos/config";
import {
  ENLACES_PRESUPUESTO_TABLA_FALTANTE,
  crearOReutilizarPresupuesto,
} from "@labo/db/repos/enlaces";
import { getById as getPacienteById } from "@labo/db/repos/pacientes";
import {
  PACIENTE_LIBRE_REQUIERE_FICHA,
  PRESUPUESTO_NO_ENCONTRADO,
  cambiarEstado,
  getById as getPresupuesto,
} from "@labo/db/repos/presupuestos";
import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";
import {
  asuntoEmail,
  enlaceWhatsApp,
  htmlEmail,
  mailtoPresupuesto,
  mensajeWhatsApp,
} from "@labo/lib/enlace-presupuesto";
import { normalizarEmail, normalizarTelefonoWhatsApp } from "@labo/lib/enlace-resultado";
import { formatNumeroPresupuesto } from "@labo/lib/numero-presupuesto";
import { EMAIL_NO_DISPONIBLE, resolveEmailProvider, sendEmail } from "@labo/lib/server/email";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";
import { publicOrigin } from "@/lib/public-origin";

/**
 * POST /api/presupuestos/{id}/enviar — comparte el presupuesto con el
 * paciente (F7.2.T7), espejo de `/api/resultados/{id}/enviar` (GUR-18).
 *
 * Crea (o reutiliza) el enlace corto público `/p/{slug}` y:
 *   - `canal: "whatsapp"` → devuelve el link `wa.me` con el mensaje precargado;
 *     el envío lo dispara el operador desde su propio WhatsApp.
 *   - `canal: "email"` → envía el correo server-side vía `@labo/lib/server/email`.
 *
 * Distinto de resultados: si el presupuesto está en Borrador y el envío sale
 * bien, pasa a Enviado (`cambiarEstado`, con su propia auditoría). Reenviar
 * desde Enviado no cambia el estado ni crea otro enlace (se reutiliza el
 * vigente). Ningún otro estado admite envío: un presupuesto Aprobado,
 * Rechazado, Cancelado o Cerrado ya salió del paso "mandarlo a cotizar".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CANALES = ["whatsapp", "email"] as const;
type Canal = (typeof CANALES)[number];

const ESTADOS_ENVIABLES: readonly EstadoPresupuesto[] = ["Borrador", "Enviado"];

function bad(status: number, error: string, detalle?: string): Response {
  return NextResponse.json(detalle ? { error, detalle } : { error }, { status });
}

function formatVencimiento(iso: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "long",
    timeZone: "America/Caracas",
  }).format(new Date(iso));
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
    const presupuesto = await getPresupuesto(db, params.id);
    if (!presupuesto) return bad(404, PRESUPUESTO_NO_ENCONTRADO);

    if (!ESTADOS_ENVIABLES.includes(presupuesto.estado)) {
      return bad(
        400,
        "PRESUPUESTO_ESTADO_NO_ENVIABLE",
        `No se puede enviar un presupuesto en estado ${presupuesto.estado}.`,
      );
    }

    if (!presupuesto.paciente_id) {
      // Nombre libre, sin ficha: no hay dónde sacar teléfono ni email. Mismo
      // código que usa convertToOrden para el mismo motivo.
      return bad(400, PACIENTE_LIBRE_REQUIERE_FICHA);
    }

    const paciente = await getPacienteById(db, presupuesto.paciente_id);
    if (!paciente) return bad(404, "PACIENTE_NO_ENCONTRADO");

    const telefono = normalizarTelefonoWhatsApp(paciente.telefono);
    const email = normalizarEmail(paciente.email);
    if (canal === "whatsapp" && !telefono) return bad(400, "PACIENTE_SIN_TELEFONO");
    if (canal === "email" && !email) return bad(400, "PACIENTE_SIN_EMAIL");

    const config = await getConfig(db);
    const laboratorio = config?.nombre?.trim() || "el laboratorio";

    const enlace = await crearOReutilizarPresupuesto(db, presupuesto.id, user.userId);
    const url = `${publicOrigin(request)}/p/${enlace.slug}`;
    const mensaje = {
      paciente: paciente.nombre,
      laboratorio,
      numero: formatNumeroPresupuesto(presupuesto.numero_correlativo, presupuesto.created_at),
      totalUsd: presupuesto.total_usd,
      totalBs: presupuesto.total_bs,
      tasa: presupuesto.tasa_bs,
      url,
      vence: formatVencimiento(enlace.expira_en),
    };

    const avanzarSiCorresponde = async (): Promise<void> => {
      if (presupuesto.estado === "Borrador") {
        await cambiarEstado(db, presupuesto.id, "Enviado", undefined, user.userId);
      }
    };

    if (canal === "whatsapp") {
      await avanzarSiCorresponde();
      return NextResponse.json({
        canal,
        url,
        whatsappUrl: enlaceWhatsApp(telefono as string, mensajeWhatsApp(mensaje)),
      });
    }

    // Envío server-side (Resend). Si no hay proveedor configurado, se devuelve
    // un `mailto:` y el operador lo manda desde su cuenta — mismo trato que
    // WhatsApp. Al cargar RESEND_API_KEY vuelve solo al envío automático.
    try {
      await sendEmail({
        to: email as string,
        subject: asuntoEmail(laboratorio, mensaje.numero),
        html: htmlEmail(mensaje),
      });
      await avanzarSiCorresponde();
      return NextResponse.json({ canal, url, enviadoA: email });
    } catch (reason) {
      if (!(reason instanceof Error) || reason.message !== EMAIL_NO_DISPONIBLE) throw reason;
      console.warn(
        `[presupuestos/enviar] email server-side no disponible (proveedor: ${resolveEmailProvider()}), se devuelve mailto`,
      );
      await avanzarSiCorresponde();
      return NextResponse.json({
        canal,
        url,
        mailtoUrl: mailtoPresupuesto(email as string, mensaje),
      });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return bad(error.code === "UNAUTHENTICATED" ? 401 : 403, error.code);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/presupuestos/[id]/enviar]", error);

    if (message === ENLACES_PRESUPUESTO_TABLA_FALTANTE) {
      return bad(
        503,
        ENLACES_PRESUPUESTO_TABLA_FALTANTE,
        "Falta aplicar la migración 0021 (tabla enlaces_presupuesto) en este entorno.",
      );
    }

    // El endpoint es staff-only (admin/operador): devolver la causa real acá
    // vale más que proteger un detalle interno. Un 500 opaco obliga a entrar
    // al VPS a leer logs para saber qué se rompió.
    return bad(500, "ERROR_GENERICO", message);
  }
}
