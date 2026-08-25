import { getSql, withTransaction } from '@labo/db/client';
import { scrapeBcv, scrapeDolarToday } from '@labo/lib/scrape/bcv';
import type { ScrapeResult } from '@labo/lib/scrape/bcv';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCION_EXITO = 'cron.scrape-bcv';
const ACCION_FALLO = 'cron.scrape-bcv.failed';
const ENTITY_TYPE = 'tasa_cambio_bcv';

/**
 * F3.3.T1 — Scraper BCV disparado por crontab del VPS (ADR-11).
 *
 * POST /api/cron/scrape-bcv  (header `x-cron-secret: <CRON_SECRET>`)
 *
 * Flujo: primario bcv.org.ve (retry 1+2, backoff 1s/3s) → fallback DolarAPI
 * (fuente "dolartoday") → INSERT en `tasa_cambio_bcv` + audit_log. Fallo total:
 * audit_log warning y respuesta 200 (sin lanzar), para no disparar reintentos
 * del crontab; la alerta de tasa vieja es responsabilidad de F3.3.T4.
 */

function errorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'unknown';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function persist(result: ScrapeResult): Promise<string> {
  return withTransaction(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      INSERT INTO tasa_cambio_bcv (tasa, fecha, fuente, scraped_at)
      VALUES (${result.tasa}, ${result.fecha}, ${result.fuente}, ${result.scraped_at})
      RETURNING id
    `;
    const id = rows[0].id;

    await tx`
      INSERT INTO audit_log (accion, entity_type, entity_id, metadata)
      VALUES (
        ${ACCION_EXITO},
        ${ENTITY_TYPE},
        ${id},
        ${tx.json({ tasa: result.tasa, fuente: result.fuente })}
      )
    `;

    return id;
  });
}

async function auditWarning(primaryError: unknown, fallbackError: unknown): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO audit_log (accion, entity_type, metadata)
      VALUES (
        ${ACCION_FALLO},
        ${ENTITY_TYPE},
        ${sql.json({
          primary_code: errorCode(primaryError),
          primary_message: errorMessage(primaryError),
          fallback_code: errorCode(fallbackError),
          fallback_message: errorMessage(fallbackError),
        })}
      )
    `;
  } catch (err) {
    // No lanzar: si el propio audit falla (DB caída), el cron no debe romper.
    console.error('No se pudo escribir el audit_log de fallo de scrape-bcv:', err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET no está configurado en el entorno.');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  const reqSecret = request.headers.get('x-cron-secret');
  if (!reqSecret || reqSecret !== cronSecret) {
    console.warn('Intento no autorizado de ejecutar el cron scrape-bcv.');
    return new Response('Unauthorized', { status: 401 });
  }

  let result: ScrapeResult | null = null;
  let primaryError: unknown = null;
  let fallbackError: unknown = null;

  try {
    result = await scrapeBcv();
  } catch (err) {
    primaryError = err;
    console.error('Primario bcv.org.ve falló:', errorMessage(err));
  }

  if (!result) {
    try {
      result = await scrapeDolarToday();
    } catch (err) {
      fallbackError = err;
      console.error('Fallback DolarAPI falló:', errorMessage(err));
    }
  }

  if (!result) {
    await auditWarning(primaryError, fallbackError);
    return NextResponse.json(
      {
        success: false,
        error: 'bcv_scrape_failed',
        primary_code: errorCode(primaryError),
        fallback_code: errorCode(fallbackError),
      },
      { status: 200 }
    );
  }

  try {
    const id = await persist(result);
    return NextResponse.json({ success: true, id, fuente: result.fuente, tasa: result.tasa });
  } catch (err) {
    // Fallo de persistencia: registrar warning y no lanzar.
    console.error('Persistencia de tasa falló:', err);
    await auditWarning(err, 'persist_failed');
    return NextResponse.json(
      { success: false, error: 'persist_failed', details: errorMessage(err) },
      { status: 200 }
    );
  }
}
