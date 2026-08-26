import { getSql } from '@labo/db/client';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { NextRequest, NextResponse } from 'next/server';
import { createElement } from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * F4.1.T4 — Warm-up ping PDF + health check.
 *
 * GET  /api/pdf/health                    — probe público (sin secret): verifica
 *   conexión a Postgres y loguea `pdf_health_ok`. No renderiza (barato, usable
 *   como health check externo).
 *
 * POST /api/pdf/health                    — cron (header `x-cron-secret`): verifica
 *   Postgres Y hace un render dummy mini (~1KB) para calentar `@react-pdf` en el
 *   runtime Node (mitigación cold-start, ARCH §9 / ADR-11). Loguea `pdf_health_ok`.
 */

const warmStyles = StyleSheet.create({
  page: {
    paddingHorizontal: 40,
    paddingVertical: 34,
  },
  line: {
    color: '#172033',
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
});

type DbStatus = { status: 'ok' } | { status: 'error'; detail: string };

async function checkDatabase(): Promise<DbStatus> {
  if (!process.env.DATABASE_URL) {
    return { status: 'error', detail: 'DATABASE_URL not configured' };
  }
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    return { status: 'ok' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: 'error', detail };
  }
}

async function renderWarmupPdf(): Promise<{ bytes: number; durationMs: number }> {
  const startedAt = performance.now();
  const document = createElement(
    Document,
    { author: 'RV Laboratorio', subject: 'PDF health warm-up', title: 'health-warm-up' },
    createElement(
      Page,
      { size: 'A4', style: warmStyles.page },
      createElement(View, null, createElement(Text, { style: warmStyles.line }, 'pdf health warm-up'))
    )
  );
  const buffer = await renderToBuffer(document);
  return { bytes: buffer.byteLength, durationMs: performance.now() - startedAt };
}

function logHealth(opts: {
  db: string;
  ok: boolean;
  durationMs: number;
  warm?: { bytes: number; durationMs: number };
}): void {
  console.info(
    JSON.stringify({
      metric: 'pdf_health_ok',
      ok: opts.ok,
      db: opts.db,
      durationMs: Number(opts.durationMs.toFixed(2)),
      ...(opts.warm
        ? { warmBytes: opts.warm.bytes, warmDurationMs: Number(opts.warm.durationMs.toFixed(2)) }
        : {}),
    })
  );
}

export async function GET(): Promise<Response> {
  const startedAt = performance.now();
  const db = await checkDatabase();
  const ok = db.status === 'ok';
  const durationMs = performance.now() - startedAt;

  logHealth({ db: db.status, ok, durationMs });

  if (!ok) {
    return NextResponse.json(
      { ok: false, db: { status: 'error', detail: db.detail } },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, db: { status: 'ok' } });
}

export async function POST(request: NextRequest): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET no está configurado en el entorno.');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  const reqSecret = request.headers.get('x-cron-secret');
  if (!reqSecret || reqSecret !== cronSecret) {
    console.warn('Intento no autorizado de ejecutar el warm-up pdf-health.');
    return new Response('Unauthorized', { status: 401 });
  }

  const startedAt = performance.now();
  const db = await checkDatabase();
  const warm = await renderWarmupPdf();
  const ok = db.status === 'ok';
  const durationMs = performance.now() - startedAt;

  logHealth({ db: db.status, ok, durationMs, warm });

  if (!ok) {
    return NextResponse.json(
      { ok: false, db: { status: 'error', detail: db.detail }, warmBytes: warm.bytes },
      { status: 503 }
    );
  }
  return NextResponse.json({
    ok: true,
    db: { status: 'ok' },
    warmBytes: warm.bytes,
  });
}
