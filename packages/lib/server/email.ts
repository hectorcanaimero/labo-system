import { createAdminClient } from '@insforge/sdk';

/**
 * Envío de emails server-side (ADR-11, F3.3.T4, GUR-18).
 *
 * Proveedores, en orden de preferencia:
 *   1. **Resend** (`RESEND_API_KEY`): es el servicio de email del laboratorio.
 *      El dominio del remitente ya está verificado ahí (ver
 *      docs/deploy/insforge-vps.md § Messaging). Se llama a la API HTTP
 *      directo con `fetch`, sin SDK.
 *   2. **InsForge Messaging** (`INSFORGE_API_KEY`): sólo si no hay key de
 *      Resend. En el plan free responde 403 "not available for free plan",
 *      así que en la práctica no envía.
 *   3. Ninguno configurado → `EMAIL_NO_DISPONIBLE`, para que el caller ofrezca
 *      una alternativa (el endpoint de resultados devuelve un `mailto:`).
 *
 * En tests (`NODE_ENV === 'test'`) o con `EMAIL_MOCK=true` no envía: loguea el
 * payload con prefijo `[mailer:mock]`. Ya NO se mockea en `development`: staging
 * corre con ese NODE_ENV y el mock hacía que la UI dijera "enviado" sin mandar
 * nada. Con las keys cargadas, dev y staging envían de verdad.
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

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

/**
 * No hay servicio de email utilizable: no hay proveedor configurado, el plan
 * no lo incluye (`403`) o la credencial no alcanza (`401`). Se distingue de un
 * fallo de envío real para que el caller pueda ofrecer una alternativa en vez
 * de tratarlo como un error inesperado.
 */
export const EMAIL_NO_DISPONIBLE = 'EMAIL_NO_DISPONIBLE';

const RESEND_API_URL = 'https://api.resend.com/emails';

/** Remitente verificado en Resend (docs/deploy/insforge-vps.md § Messaging). */
const DEFAULT_FROM = 'Rv Laboratorio <noreply@rvlaboratorio.com>';

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
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
 * autoriza el envío. Mensajes observados:
 *   InsForge 403 "Custom email service is not available for free plan..."
 *   InsForge 401 "Sending emails requires an authenticated user"
 *   Resend 403 "The ... domain is not verified" / 401 "API key is invalid"
 */
export function esEmailNoDisponible(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('not available for free plan') ||
    m.includes('requires an authenticated user') ||
    m.includes('forbidden') ||
    m.includes('upgrade') ||
    m.includes('not verified') ||
    m.includes('api key is invalid') ||
    m.includes('missing api key')
  );
}

/** Qué proveedor va a usar `sendEmail` con el entorno actual. Útil para logs. */
export type EmailProvider = 'mock' | 'resend' | 'insforge' | 'none';

export function resolveEmailProvider(): EmailProvider {
  if (process.env.NODE_ENV === 'test' || env('EMAIL_MOCK') === 'true') return 'mock';
  if (env('RESEND_API_KEY')) return 'resend';
  if (env('INSFORGE_API_KEY') && (env('INSFORGE_URL') || env('NEXT_PUBLIC_INSFORGE_URL'))) {
    return 'insforge';
  }
  return 'none';
}

async function sendViaResend(options: SendEmailOptions): Promise<void> {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env('EMAIL_FROM') || DEFAULT_FROM,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
    }),
  });
  if (response.ok) return;

  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  const message = payload?.message ?? `HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403 || esEmailNoDisponible(message)) {
    console.error(`[@labo/lib/server/email] Resend rechazó el envío (${response.status}): ${message}`);
    throw new Error(EMAIL_NO_DISPONIBLE);
  }
  throw new Error(`[@labo/lib/server/email] Resend: fallo al enviar email (${response.status}): ${message}`);
}

async function sendViaInsforge(options: SendEmailOptions): Promise<void> {
  const baseUrl = (env('INSFORGE_URL') || env('NEXT_PUBLIC_INSFORGE_URL')).replace(/\/+$/, '');
  // La anon key NO sirve acá: `/api/email/send-raw` responde
  // `401 AUTH_INVALID_CREDENTIALS`. El envío server-side va con la key admin.
  const client = createAdminClient({ baseUrl, apiKey: env('INSFORGE_API_KEY') });

  const { error } = await client.emails.send({
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  if (error) {
    if (esEmailNoDisponible(error.message)) {
      console.error(`[@labo/lib/server/email] InsForge rechazó el envío: ${error.message}`);
      throw new Error(EMAIL_NO_DISPONIBLE);
    }
    throw new Error(`[@labo/lib/server/email] InsForge: fallo al enviar email: ${error.message}`);
  }
}

/**
 * Núcleo de envío. Lanza si el envío falla para que el caller decida el
 * manejo: `EMAIL_NO_DISPONIBLE` cuando no hay proveedor utilizable, otro
 * `Error` ante un fallo de envío real.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const provider = resolveEmailProvider();
  switch (provider) {
    case 'mock':
      console.log('[mailer:mock] email no enviado:', JSON.stringify(options));
      return;
    case 'resend':
      return sendViaResend(options);
    case 'insforge':
      return sendViaInsforge(options);
    case 'none':
      console.warn(
        '[@labo/lib/server/email] sin proveedor de email: definí RESEND_API_KEY (o INSFORGE_API_KEY).',
      );
      throw new Error(EMAIL_NO_DISPONIBLE);
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
