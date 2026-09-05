"use client";

import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";

/**
 * Envío del resultado al paciente por WhatsApp o email (GUR-18).
 *
 * Cada botón queda deshabilitado si el paciente no tiene el dato de contacto
 * del canal. El backend crea (o reutiliza) el enlace corto público y devuelve
 * el link `wa.me` — abrirlo se hace acá, en el gesto del click, para que el
 * navegador no lo bloquee como popup.
 */

interface EnviarResultadoButtonsProps {
  ordenId: string;
  telefono: string | null;
  email: string | null;
}

type Canal = "whatsapp" | "email";

const MENSAJES_ERROR: Record<string, string> = {
  PACIENTE_SIN_TELEFONO: "El paciente no tiene un teléfono válido cargado.",
  PACIENTE_SIN_EMAIL: "El paciente no tiene un correo cargado.",
  ORDEN_NO_ENCONTRADA: "No se encontró la orden.",
  UNAUTHORIZED: "No tenés permisos para enviar resultados.",
  ENLACES_TABLA_FALTANTE:
    "Falta aplicar la migración 0014 en este entorno. Avisá a soporte técnico.",
};

export function EnviarResultadoButtons({
  ordenId,
  telefono,
  email,
}: EnviarResultadoButtonsProps) {
  const [enviando, setEnviando] = useState<Canal | null>(null);

  async function enviar(canal: Canal): Promise<void> {
    // El popup se abre sincrónicamente y se navega al recibir la URL: si
    // esperáramos al fetch, Safari/Firefox lo bloquean. Aplica a WhatsApp
    // siempre, y a email cuando el backend devuelve un `mailto:` de fallback.
    const ventana = window.open("", "_blank", "noopener,noreferrer");

    try {
      setEnviando(canal);
      const response = await fetch(`/api/resultados/${ordenId}/enviar`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ canal }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            whatsappUrl?: string;
            mailtoUrl?: string;
            enviadoA?: string;
            error?: string;
            detalle?: string;
          }
        | null;

      if (!response.ok) {
        // Sin `detalle` el operador sólo ve "no se pudo" y hay que ir al VPS a
        // leer logs para saber por qué. Lo mostramos cuando el backend lo manda.
        const conocido = MENSAJES_ERROR[body?.error ?? ""];
        throw new Error(
          conocido ??
            (body?.detalle
              ? `No se pudo enviar el resultado: ${body.detalle}`
              : "No se pudo enviar el resultado."),
        );
      }

      const handoff = body?.whatsappUrl ?? body?.mailtoUrl;
      if (handoff) {
        if (ventana) ventana.location.href = handoff;
        else window.open(handoff, "_blank", "noopener,noreferrer");
        notifySuccess(
          body?.whatsappUrl
            ? "WhatsApp abierto con el mensaje listo para enviar."
            : "Se abrió tu cliente de correo con el mensaje listo para enviar.",
        );
        return;
      }

      ventana?.close();
      notifySuccess(`Resultado enviado a ${body?.enviadoA ?? "el paciente"}.`);
    } catch (reason) {
      ventana?.close();
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
        disabled={!telefono || enviando !== null}
        title={telefono ? "Enviar por WhatsApp" : "El paciente no tiene teléfono cargado"}
        onClick={() => void enviar("whatsapp")}
      >
        <MessageCircle className="h-4 w-4" />
        {enviando === "whatsapp" ? "Preparando…" : "WhatsApp"}
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={!email || enviando !== null}
        title={email ? `Enviar a ${email}` : "El paciente no tiene correo cargado"}
        onClick={() => void enviar("email")}
      >
        <Mail className="h-4 w-4" />
        {enviando === "email" ? "Enviando…" : "Email"}
      </Button>
    </>
  );
}
