import { getSql } from '@labo/db/client';
import { getLatest } from '@labo/db/repos/tasa';
import { sendTasaStaleAlert } from '@labo/lib/server/email';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * F3.3.T4 — Cron diario de alerta de tasa stale a Admin.
 *
 * POST /api/cron/check-stale-tasa  (header `x-cron-secret: <CRON_SECRET>`)
 *
 * Si la tasa más reciente supera las 48h (o no existe NINGUNA), envía un email
 * a los admins (`usuarios.role = 'admin'` AND `activo`) vía InsForge Messaging
 * (ADR-11). Idempotente: no re-envía si ya alertó hoy (marca en `audit_log`).
 *
 * Fallos (envío, DB) se registran en `audit_log` con accion `*.failed` y se
 * responden con 200 para no disparar reintentos del crontab; la alerta se
 * reintenta al día siguiente.
 */

const ALERT_AFTER_MS = 48 * 60 * 60 * 1000; // 2 días
const MS_PER_HOUR = 60 * 60 * 1000;

const ACCION_ALERTA = 'tasa.alert_stale_email';
const ACCION_FALLO = 'tasa.alert_stale_email.failed';
const ENTITY_TYPE = 'tasa_cambio_bcv';

interface TasaIdRow {
  id: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function alreadyAlertedToday(sql: ReturnType<typeof getSql>): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM audit_log
    WHERE accion = ${ACCION_ALERTA}
      AND created_at >= date_trunc('day', now())
    LIMIT 1
  `;
  return rows.length > 0;
}

async function getAdminEmails(sql: ReturnType<typeof getSql>): Promise<string[]> {
  const rows = await sql<{ email: string }[]>`
    SELECT email
    FROM usuarios
    WHERE role = 'admin'
      AND activo = true
    ORDER BY created_at ASC
  `;
  return rows.map((row) => row.email);
}

export async function POST(request: NextRequest): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET no está configurado en el entorno.');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  const reqSecret = request.headers.get('x-cron-secret');
  if (!reqSecret || reqSecret !== cronSecret) {
    console.warn('Intento no autorizado de ejecutar el cron check-stale-tasa.');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const sql = getSql();
    const latest = await getLatest(sql);

    const yaAlertado = await alreadyAlertedToday(sql);
    if (yaAlertado) {
      return NextResponse.json({
        success: true,
        alerted: false,
        reason: 'already_alerted_today',
      });
    }

    const horas = latest ? (Date.now() - latest.scraped_at.getTime()) / MS_PER_HOUR : null;
    const debeAlertar = latest === null || (horas !== null && horas * MS_PER_HOUR > ALERT_AFTER_MS);

    if (!debeAlertar) {
      return NextResponse.json({ success: true, alerted: false, reason: 'tasa_vigente' });
    }

    const adminEmails = await getAdminEmails(sql);
    if (adminEmails.length === 0) {
      await sql`
        INSERT INTO audit_log (accion, entity_type, metadata)
        VALUES (
          ${ACCION_FALLO},
          ${ENTITY_TYPE},
          ${sql.json({ reason: 'no_admins', horas })}
        )
      `;
      console.warn('[check-stale-tasa] No hay admins activos para notificar.');
      return NextResponse.json({ success: true, alerted: false, reason: 'no_admins' });
    }

    try {
      await sendTasaStaleAlert({
        to: adminEmails,
        tasa: latest?.tasa ?? null,
        ultimaActualizacion: latest?.scraped_at ?? null,
        horasDesdeUltima: horas !== null ? Math.round(horas) : null,
        sinTasa: latest === null,
      });

      const [tasaIdRow] = latest
        ? await sql<TasaIdRow[]>`
            SELECT id
            FROM tasa_cambio_bcv
            ORDER BY fecha DESC, scraped_at DESC
            LIMIT 1
          `
        : [null];

      await sql`
        INSERT INTO audit_log (accion, entity_type, entity_id, metadata)
        VALUES (
          ${ACCION_ALERTA},
          ${ENTITY_TYPE},
          ${tasaIdRow?.id ?? null},
          ${sql.json({
            horas: horas !== null ? Math.round(horas) : null,
            sin_tasa: latest === null,
            destinatarios: adminEmails,
          })}
        )
      `;

      return NextResponse.json({ success: true, alerted: true });
    } catch (err) {
      await sql`
        INSERT INTO audit_log (accion, entity_type, metadata)
        VALUES (
          ${ACCION_FALLO},
          ${ENTITY_TYPE},
          ${sql.json({ reason: 'email_send_failed', error: errorMessage(err) })}
        )
      `;
      console.error('[check-stale-tasa] Falló el envío de la alerta:', errorMessage(err));
      return NextResponse.json(
        { success: false, error: 'email_send_failed', details: errorMessage(err) },
        { status: 200 },
      );
    }
  } catch (err) {
    console.error('[check-stale-tasa] Falló el job completo:', errorMessage(err));
    return NextResponse.json(
      { success: false, error: 'job_failed', details: errorMessage(err) },
      { status: 200 },
    );
  }
}
