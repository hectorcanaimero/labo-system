"use client";

import { EnviarButtons } from "@labo/ui/envio/EnviarButtons";

/**
 * Envío del presupuesto al paciente por WhatsApp o email (F7.2.T7).
 *
 * Wrapper delgado sobre `@labo/ui/envio/EnviarButtons` (compartido con
 * resultados) con el endpoint y los códigos de error propios de
 * presupuestos.
 */

interface EnviarPresupuestoButtonsProps {
  presupuestoId: string;
  telefono: string | null;
  email: string | null;
}

const MENSAJES_ERROR: Record<string, string> = {
  PRESUPUESTO_NO_ENCONTRADO: "No se encontró el presupuesto.",
  PRESUPUESTO_ESTADO_NO_ENVIABLE: "Este presupuesto ya no se puede enviar en su estado actual.",
  PACIENTE_LIBRE_REQUIERE_FICHA:
    "Este presupuesto es de nombre libre, sin ficha de paciente: no hay teléfono ni correo para enviarlo.",
  ENLACES_PRESUPUESTO_TABLA_FALTANTE:
    "Falta aplicar la migración 0021 en este entorno. Avisá a soporte técnico.",
};

export function EnviarPresupuestoButtons({
  presupuestoId,
  telefono,
  email,
}: EnviarPresupuestoButtonsProps) {
  return (
    <EnviarButtons
      endpoint={`/api/presupuestos/${presupuestoId}/enviar`}
      telefono={telefono}
      email={email}
      entidad="Presupuesto"
      mensajesError={MENSAJES_ERROR}
    />
  );
}
