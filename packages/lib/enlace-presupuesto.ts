/**
 * Armado de mensajes para enviar un presupuesto al paciente por WhatsApp o
 * email (F7.2.T7).
 *
 * Espejo de `enlace-resultado.ts`: mismo slug, mismos normalizadores de
 * teléfono/email (se reusan de ahí, no se duplican acá), mismo patrón de
 * `mensajeWhatsApp` / `asuntoEmail` / `htmlEmail` / `mailtoPresupuesto`. Lo
 * que cambia es el contenido: un presupuesto no tiene datos clínicos, así
 * que el mensaje SÍ lleva el total (USD y Bs) y la tasa usada, y aclara que
 * la cotización vale 24 horas (el enlace en sí dura más: 7 días, ver
 * `crearOReutilizarPresupuesto`).
 */

import { formatBs, formatUsd } from "./bs-format";

export interface MensajePresupuestoInput {
  /** Nombre de pila del paciente, para el saludo. */
  paciente: string;
  /** Nombre del laboratorio (de `laboratorio_config.nombre`). */
  laboratorio: string;
  /** Número correlativo formateado (`formatNumeroPresupuesto`), ej. "PR-2026-000127". */
  numero: string;
  totalUsd: number;
  totalBs: number;
  /** Tasa Bs/USD usada para cotizar. */
  tasa: number;
  /** URL corta pública del presupuesto. */
  url: string;
  /** Fecha de vencimiento del ENLACE (7 días), ya formateada para mostrar. */
  vence?: string | null;
}

function resumenMonto(input: MensajePresupuestoInput): string {
  return `USD ${formatUsd(input.totalUsd)} (Bs. ${formatBs(input.totalBs)} a una tasa de ${input.tasa.toFixed(2)} Bs/USD)`;
}

/** Texto plano del mensaje de WhatsApp. Mismo tono formal que resultados. */
export function mensajeWhatsApp(input: MensajePresupuestoInput): string {
  const vigenciaEnlace = input.vence
    ? `\n\nPor su seguridad, el enlace es personal y estará disponible hasta el ${input.vence}.`
    : "\n\nPor su seguridad, el enlace es personal y tiene una vigencia limitada.";

  return (
    `Estimado/a ${input.paciente}, le saluda ${input.laboratorio}.\n\n` +
    `Le enviamos el presupuesto ${input.numero} por un total de ${resumenMonto(input)}. ` +
    `Esta cotización tiene una validez de 24 horas desde su emisión. ` +
    `Puede consultar el detalle en el siguiente enlace:\n${input.url}` +
    vigenciaEnlace +
    `\n\nAnte cualquier consulta, quedamos a su disposición.`
  );
}

/** Link `wa.me` listo para abrir con el mensaje precargado. */
export function enlaceWhatsApp(telefonoNormalizado: string, mensaje: string): string {
  return `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(mensaje)}`;
}

export function asuntoEmail(laboratorio: string, numero: string): string {
  return `Presupuesto ${numero} — ${laboratorio}`;
}

/**
 * Link `mailto:` con asunto y cuerpo precargados, para cuando el envío
 * server-side no está disponible (mismo trato que `mailtoResultado`).
 */
export function mailtoPresupuesto(email: string, input: MensajePresupuestoInput): string {
  const params = new URLSearchParams({
    subject: asuntoEmail(input.laboratorio, input.numero),
    body: mensajeWhatsApp(input),
  });
  // URLSearchParams codifica el espacio como "+", que en el cuerpo de un
  // mailto se muestra literal. RFC 6068 pide %20.
  return `mailto:${encodeURIComponent(email)}?${params.toString().replace(/\+/g, "%20")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cuerpo HTML del email. Mismo tono que el de WhatsApp. */
export function htmlEmail(input: MensajePresupuestoInput): string {
  const paciente = escapeHtml(input.paciente);
  const laboratorio = escapeHtml(input.laboratorio);
  const numero = escapeHtml(input.numero);
  const url = escapeHtml(input.url);
  const monto = escapeHtml(resumenMonto(input));
  const vigenciaEnlace = input.vence
    ? `El enlace es personal y estará disponible hasta el ${escapeHtml(input.vence)}.`
    : "El enlace es personal y tiene una vigencia limitada.";

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">
      <p style="margin: 0 0 12px;">Estimado/a ${paciente},</p>
      <p style="margin: 0 0 12px;">
        Le saluda <strong>${laboratorio}</strong>. Le enviamos el presupuesto <strong>${numero}</strong>
        por un total de <strong>${monto}</strong>. Esta cotización tiene una validez de 24 horas desde su emisión.
      </p>
      <p style="margin: 0 0 20px;">
        <a href="${url}" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600;">
          Ver presupuesto
        </a>
      </p>
      <p style="margin: 0 0 12px; font-size: 12px; color: #64748b;">
        Si el botón no funciona, copie y pegue esta dirección en su navegador:<br />
        <span style="word-break: break-all;">${url}</span>
      </p>
      <p style="margin: 0 0 12px; font-size: 12px; color: #64748b;">${vigenciaEnlace}</p>
      <p style="margin: 0; font-size: 12px; color: #64748b;">
        Ante cualquier consulta, quedamos a su disposición.
      </p>
    </div>
  `;
}
