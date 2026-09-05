import { createAdminClient } from '@insforge/sdk';

/**
 * Envío de emails vía InsForge Messaging SDK (ADR-11, F3.3.T4).
 *
 * - En dev/test (`NODE_ENV !== 'production'`) NO envía: loguea el payload con
 *   prefijo `[mailer:mock]` (criterio "mock/log en dev").
 * - En producción usa `client.emails.send({ to, subject, html })` del SDK.
 * - El job de cron (`/api/cron/check-stale-tasa`) es quien decide *cuándo*
 *   alertar y registra la idempotencia en `audit_log`; este módulo sólo envía.
 */

export interface SendTasaStaleAlertInput {
  /** Emails de destino (admins). */
  to: string[];
  /** Tasa vigente, o `null` si nunca hubo una registrada. */
  tasa: number | null;
  /** Fecha de la última actualización, o `null` si no existe. */
  ultimaActualizacion: Date | null;
  /** Horas transcurridas desde la última actualización. */
  horasDesdeUltima: number | null;
  /** `true` si no existe NINGÚN registro de tasa en la tabla. */
  sinTasa?: boolean;
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

interface InsforgeConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * El servicio de email de InsForge no está disponible en este proyecto: o el
 * plan no lo incluye (`403 FORBIDDEN`) o la credencial no alcanza (`401`).
 * Se distingue de un fallo de envío real para que el caller pueda ofrecer una
 * alternativa en vez de tratarlo como un error inesperado.
 */
export const EMAIL_NO_DISPONIBLE = 'EMAIL_NO_DISPONIBLE';

function readInsforgeConfig(): InsforgeConfig {
  const baseUrl = (process.env.INSFORGE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL)?.replace(
    /\/+$/,
    '',
  );
  if (!baseUrl || baseUrl.length === 0) {
    throw new Error(
      '[@labo/lib/server/email] INSFORGE_URL no está definida. Es requerida para enviar emails.',
    );
  }
  // La anon key NO sirve acá: `/api/email/send-raw` responde
  // `401 AUTH_INVALID_CREDENTIALS` ("Sending emails requires an authenticated
  // user"). El envío server-side va con la API key admin.
  return {
    baseUrl,
    apiKey: process.env.INSFORGE_API_KEY?.trim() ?? '',
  };
}

function formatFecha(date: Date | null): string {
  if (!date) return '—';
  return date.toISOString();
}

function buildTasaStaleAlert(input: SendTasaStaleAlertInput): {
  subject: string;
  html: string;
} {
  const detalle = input.sinTasa
    ? 'No existe ningún registro de tasa de cambio en la base.'
    : `La tasa vigente (${input.tasa}) fue actualizada hace aproximadamente ${input.horasDesdeUltima} horas.`;

  const subject = `[LabSystem] Alerta: tasa de cambio BCV desactualizada`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #1e293b;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #b45309;">Tasa de cambio BCV desactualizada</h2>
      <p style="margin: 0 0 12px;">${detalle}</p>
      <table style="border-collapse: collapse; margin: 0 0 12px;">
        <tbody>
          <tr>
            <td style="padding: 4px 12px 4px 0; font-weight: 600;">Tasa</td>
            <td style="padding: 4px 0;">${input.tasa ?? '—'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 12px 4px 0; font-weight: 600;">Última actualización</td>
            <td style="padding: 4px 0;">${formatFecha(input.ultimaActualizacion)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 12px 4px 0; font-weight: 600;">Antigüedad</td>
            <td style="padding: 4px 0;">${input.horasDesdeUltima !== null ? `${input.horasDesdeUltima} horas` : '—'}</td>
          </tr>
        </tbody>
      </table>
      <p style="margin: 0; color: #64748b; font-size: 12px;">Revisá el scraper BCV o cargá una tasa manual desde Config Empresa.</p>
    </div>
  `;

  return { subject, html };
}

/**
 * El plan del proyecto no incluye el servicio de email, o la credencial no
 * autoriza el envío. Mensajes observados en `/api/email/send-raw`:
 *   403 "Custom email service is not available for free plan..."
 *   401 "Sending emails requires an authenticated user"
 */
export function esEmailNoDisponible(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('not available for free plan') ||
    m.includes('requires an authenticated user') ||
    m.includes('forbidden') ||
    m.includes('upgrade')
  );
}

/**
 * Núcleo de envío. Mock/log en dev, SDK de InsForge en producción.
 * Lanza error si el envío falla para que el caller decida el manejo
 * (el cron registra el fallo en `audit_log` y NO marca como alertado).
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[mailer:mock] email no enviado (dev):', JSON.stringify(options));
    return;
  }

  const { baseUrl, apiKey } = readInsforgeConfig();
  if (apiKey.length === 0) throw new Error(EMAIL_NO_DISPONIBLE);

  const client = createAdminClient({ baseUrl, apiKey });

  const { error } = await client.emails.send({
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  if (error) {
    if (esEmailNoDisponible(error.message)) throw new Error(EMAIL_NO_DISPONIBLE);
    throw new Error(`[@labo/lib/server/email] fallo al enviar email: ${error.message}`);
  }
}

/**
 * Alerta de tasa stale/ausente a los admins (spec §7.3 / F3.3.T4).
 * Compone subject + cuerpo y delega en `sendEmail`.
 */
export async function sendTasaStaleAlert(input: SendTasaStaleAlertInput): Promise<void> {
  if (input.to.length === 0) return;
  const { subject, html } = buildTasaStaleAlert(input);
  await sendEmail({ to: input.to, subject, html });
}
