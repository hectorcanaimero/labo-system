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
};

export function EnviarResultadoButtons({
  ordenId,
  telefono,
  email,
}: EnviarResultadoButtonsProps) {
  const [enviando, setEnviando] = useState<Canal | null>(null);

  async function enviar(canal: Canal): Promise<void> {
    // El popup de WhatsApp se abre sincrónicamente y se navega al recibir la
    // URL: si esperáramos al fetch, Safari/Firefox lo bloquean.
    const ventana = canal === "whatsapp" ? window.open("", "_blank", "noopener,noreferrer") : null;

    try {
      setEnviando(canal);
      const response = await fetch(`/api/resultados/${ordenId}/enviar`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ canal }),
      });
      const body = (await response.json().catch(() => null)) as
        | { whatsappUrl?: string; enviadoA?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          MENSAJES_ERROR[body?.error ?? ""] ?? "No se pudo enviar el resultado.",
        );
      }

      if (canal === "whatsapp" && body?.whatsappUrl) {
        if (ventana) ventana.location.href = body.whatsappUrl;
        else window.open(body.whatsappUrl, "_blank", "noopener,noreferrer");
        notifySuccess("WhatsApp abierto con el mensaje listo para enviar.");
        return;
      }

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
