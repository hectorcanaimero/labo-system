import { getLatest } from '@labo/db/repos/tasa';
import { sendTasaStaleAlert } from '@labo/lib/server/email';
import { getAdminDb } from '@/lib/db-server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron diario que alerta a los admins cuando la tasa está stale (>48h) o no
 * existe ninguna. Idempotente por día — no re-envía si ya alertó hoy.
 */

const ALERT_AFTER_MS = 48 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const ACCION_ALERTA = 'tasa.alert_stale_email';
const ACCION_FALLO = 'tasa.alert_stale_email.failed';
const ENTITY_TYPE = 'tasa_cambio_bcv';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(request: NextRequest): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET no está configurado.');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  const reqSecret = request.headers.get('x-cron-secret');
  if (!reqSecret || reqSecret !== cronSecret) {
    console.warn('Intento no autorizado del cron check-stale-tasa.');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const db = getAdminDb();
    const latest = await getLatest(db);

    // ¿Ya alertó hoy?
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const alreadyRes = await db
      .from('audit_log')
      .select('id', { head: true, count: 'exact' })
      .eq('accion', ACCION_ALERTA)
      .gte('created_at', startOfDay.toISOString());
    if (alreadyRes.error) throw new Error(alreadyRes.error.message);
    if ((alreadyRes.count ?? 0) > 0) {
      return NextResponse.json({
        success: true,
        alerted: false,
        reason: 'already_alerted_today',
      });
    }

    const horas = latest
      ? (Date.now() - new Date(latest.scraped_at).getTime()) / MS_PER_HOUR
      : null;
    const debeAlertar =
      latest === null || (horas !== null && horas * MS_PER_HOUR > ALERT_AFTER_MS);

    if (!debeAlertar) {
      return NextResponse.json({ success: true, alerted: false, reason: 'tasa_vigente' });
    }

    // Admins activos
    const adminRes = await db
      .from('usuarios')
      .select('email')
      .eq('role', 'admin')
      .eq('activo', true)
      .order('created_at', { ascending: true });
    if (adminRes.error) throw new Error(adminRes.error.message);
    const adminEmails = ((adminRes.data ?? []) as Array<{ email: string }>).map(
      (r) => r.email,
    );

    if (adminEmails.length === 0) {
      await db.from('audit_log').insert({
        accion: ACCION_FALLO,
        entity_type: ENTITY_TYPE,
        metadata: { reason: 'no_admins', horas },
      });
      console.warn('[check-stale-tasa] No hay admins activos.');
      return NextResponse.json({ success: true, alerted: false, reason: 'no_admins' });
    }

    try {
      await sendTasaStaleAlert({
        to: adminEmails,
        tasa: latest?.tasa ?? null,
        ultimaActualizacion: latest ? new Date(latest.scraped_at) : null,
        horasDesdeUltima: horas !== null ? Math.round(horas) : null,
        sinTasa: latest === null,
      });

      // Id de la tasa más reciente para trazabilidad.
      let tasaId: string | null = null;
      if (latest) {
        const r = await db
          .from('tasa_cambio_bcv')
          .select('id')
          .order('fecha', { ascending: false })
          .order('scraped_at', { ascending: false })
          .limit(1);
        if (!r.error)
          tasaId = ((r.data?.[0] as { id: string } | undefined)?.id) ?? null;
      }

      await db.from('audit_log').insert({
        accion: ACCION_ALERTA,
        entity_type: ENTITY_TYPE,
        entity_id: tasaId,
        metadata: {
          horas: horas !== null ? Math.round(horas) : null,
          sin_tasa: latest === null,
          destinatarios: adminEmails,
        },
      });

      return NextResponse.json({ success: true, alerted: true });
    } catch (err) {
      await db.from('audit_log').insert({
        accion: ACCION_FALLO,
        entity_type: ENTITY_TYPE,
        metadata: { reason: 'email_send_failed', error: errorMessage(err) },
      });
      console.error('[check-stale-tasa] Falló el envío:', errorMessage(err));
      return NextResponse.json(
        { success: false, error: 'email_send_failed', details: errorMessage(err) },
        { status: 200 },
      );
    }
  } catch (err) {
    console.error('[check-stale-tasa] Falló el job:', errorMessage(err));
    return NextResponse.json(
      { success: false, error: 'job_failed', details: errorMessage(err) },
      { status: 200 },
    );
  }
}
