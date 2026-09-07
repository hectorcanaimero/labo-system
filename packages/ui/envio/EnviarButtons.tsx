"use client";

import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { normalizarEmail, normalizarTelefonoWhatsApp } from "@labo/lib/enlace-resultado";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";

/**
 * Envío de un enlace público al paciente por WhatsApp o email (GUR-18,
 * F7.2.T7).
 *
 * Extraído de `EnviarResultadoButtons` (resultados) para reusarlo tal cual en
 * presupuestos: mismo endpoint `POST .../enviar` con `{ canal }`, mismos dos
 * botones, misma lógica de deshabilitado. Lo único que cambia entre
 * entidades es el endpoint y los textos (nombre de la entidad y los códigos
 * de error propios de cada una).
 *
 * Cada botón queda deshabilitado si el paciente no tiene un dato de contacto
 * *utilizable* para ese canal: se valida con los mismos normalizadores que usa
 * el backend, así el botón no promete lo que el endpoint va a rechazar.
 *
 * - WhatsApp: el backend crea (o reutiliza) el enlace corto público y devuelve
 *   el link `wa.me`. La pestaña se abre acá, en el gesto del click, para que el
 *   navegador no la bloquee como popup.
 * - Email: el backend lo envía server-side (Resend). Si no hay proveedor
 *   configurado devuelve un `mailto:` que se abre en esta misma pestaña.
 */

export interface EnviarButtonsProps {
  /** `POST` completo, p. ej. `/api/resultados/{id}/enviar` o `/api/presupuestos/{id}/enviar`. */
  endpoint: string;
  telefono: string | null;
  email: string | null;
  /** Sustantivo capitalizado para los mensajes ("Resultado", "Presupuesto"). */
  entidad: string;
  /** Códigos de error propios de esa entidad → texto humano (además de los genéricos). */
  mensajesError?: Record<string, string>;
}

type Canal = "whatsapp" | "email";

interface EnviarResponse {
  whatsappUrl?: string;
  mailtoUrl?: string;
  enviadoA?: string;
  error?: string;
  detalle?: string;
}

const MENSAJES_ERROR_COMUNES: Record<string, string> = {
  PACIENTE_SIN_TELEFONO: "El paciente no tiene un teléfono válido cargado.",
  PACIENTE_SIN_EMAIL: "El paciente no tiene un correo válido cargado.",
  UNAUTHORIZED: "No tenés permisos para enviar esto.",
};

/**
 * Abre una pestaña vacía de forma sincrónica (dentro del gesto del usuario) y
 * la desliga del opener. No se puede pasar `noopener` en los features:
 * con esa opción `window.open` devuelve `null` por especificación, y entonces
 * no habría forma de navegarla ni de cerrarla después.
 */
function abrirPestanaVacia(): Window | null {
  const ventana = window.open("", "_blank");
  if (ventana) ventana.opener = null;
  return ventana;
}

async function pedirEnvio(
  endpoint: string,
  canal: Canal,
  entidad: string,
  mensajesError: Record<string, string>,
): Promise<EnviarResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ canal }),
  });
  const body = (await response.json().catch(() => null)) as EnviarResponse | null;

  if (!response.ok) {
    // Sin `detalle` el operador sólo ve "no se pudo" y hay que ir al VPS a
    // leer logs para saber por qué. Lo mostramos cuando el backend lo manda.
    const conocido = mensajesError[body?.error ?? ""];
    throw new Error(
      conocido ??
        (body?.detalle
          ? `No se pudo enviar ${entidad.toLowerCase()}: ${body.detalle}`
          : `No se pudo enviar ${entidad.toLowerCase()}.`),
    );
  }
  return body ?? {};
}

export function EnviarButtons({
  endpoint,
  telefono,
  email,
  entidad,
  mensajesError,
}: EnviarButtonsProps) {
  const [enviando, setEnviando] = useState<Canal | null>(null);

  const telefonoWhatsApp = normalizarTelefonoWhatsApp(telefono);
  const emailValido = normalizarEmail(email);
  const errores = { ...MENSAJES_ERROR_COMUNES, ...mensajesError };

  async function enviarWhatsApp(): Promise<void> {
    const ventana = abrirPestanaVacia();
    try {
      setEnviando("whatsapp");
      const body = await pedirEnvio(endpoint, "whatsapp", entidad, errores);
      if (!body.whatsappUrl) throw new Error("El servidor no devolvió el enlace de WhatsApp.");

      if (ventana) ventana.location.href = body.whatsappUrl;
      else window.open(body.whatsappUrl, "_blank", "noopener,noreferrer");
      notifySuccess("WhatsApp abierto con el mensaje listo para enviar.");
    } catch (reason) {
      ventana?.close();
      notifyError(reason);
    } finally {
      setEnviando(null);
    }
  }

  async function enviarEmail(): Promise<void> {
    try {
      setEnviando("email");
      const body = await pedirEnvio(endpoint, "email", entidad, errores);

      if (body.mailtoUrl) {
        // Un `mailto:` no navega la página: sólo abre el cliente de correo.
        // Abrirlo en `_blank` dejaría una pestaña vacía colgada.
        window.location.href = body.mailtoUrl;
        notifySuccess(
          "El envío automático no está configurado: se abrió tu cliente de correo con el mensaje listo.",
        );
        return;
      }

      notifySuccess(`${entidad} enviado a ${body.enviadoA ?? email}.`);
    } catch (reason) {
      notifyError(reason);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!telefonoWhatsApp || enviando !== null}
        title={
          telefonoWhatsApp
            ? `Enviar por WhatsApp a +${telefonoWhatsApp}`
            : telefono
              ? `El teléfono cargado (${telefono}) no es un número válido para WhatsApp`
              : "El paciente no tiene teléfono cargado"
        }
        onClick={() => void enviarWhatsApp()}
      >
        <MessageCircle className="h-4 w-4" />
        {enviando === "whatsapp" ? "Preparando…" : "WhatsApp"}
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={!emailValido || enviando !== null}
        title={
          emailValido
            ? `Enviar a ${emailValido}`
            : email
              ? `El correo cargado (${email}) no es válido`
              : "El paciente no tiene correo cargado"
        }
        onClick={() => void enviarEmail()}
      >
        <Mail className="h-4 w-4" />
        {enviando === "email" ? "Enviando…" : "Email"}
      </Button>
    </>
  );
}
