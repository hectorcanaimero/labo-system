"use client";

import { EnviarButtons } from "@labo/ui/envio/EnviarButtons";

/**
 * Envío del resultado al paciente por WhatsApp o email (GUR-18).
 *
 * F7.2.T7: la lógica se movió a `@labo/ui/envio/EnviarButtons` (compartida
 * con presupuestos); este archivo queda como wrapper con los textos y el
 * endpoint propios de resultados, sin cambio de comportamiento.
 */

interface EnviarResultadoButtonsProps {
  ordenId: string;
  telefono: string | null;
  email: string | null;
}

const MENSAJES_ERROR: Record<string, string> = {
  ORDEN_NO_ENCONTRADA: "No se encontró la orden.",
  ENLACES_TABLA_FALTANTE:
    "Falta aplicar la migración 0014 en este entorno. Avisá a soporte técnico.",
};

export function EnviarResultadoButtons({
  ordenId,
  telefono,
  email,
}: EnviarResultadoButtonsProps) {
  return (
    <EnviarButtons
      endpoint={`/api/resultados/${ordenId}/enviar`}
      telefono={telefono}
      email={email}
      entidad="Resultado"
      mensajesError={MENSAJES_ERROR}
    />
  );
}
