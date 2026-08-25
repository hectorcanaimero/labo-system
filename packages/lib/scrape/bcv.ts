// F3.3.T1 — Scraper BCV (módulo puro, paquete hoja ADR-08).
//
// Port en TypeScript del POC validado en S1 (`scripts/spike-s1-bcv/src/scrapeBcv.mjs`).
// No accede a DB ni a Next: sólo fetch/parse + retry. La persistencia y el audit
// log viven en el Route Handler `apps/web/app/api/cron/scrape-bcv/route.ts`.
//
// Hallazgo clave (S1 DECISION.md, validado 2026-08-23): bcv.org.ve sirve una cadena
// TLS incompleta (falta el intermedio Sectigo). Node `fetch` falla con
// UNABLE_TO_VERIFY_LEAF_SIGNATURE; por eso el primario usa `node:https` con un
// agente "laxo" scoped SÓLO a bcv.org.ve (la tasa es dato público no sensible;
// el riesgo MITM se neutraliza con sanity-check de rango en el parseo).
//
// Fallback: DolarToday está MUERTO (S1). Se usa DolarAPI
// (`ve.dolarapi.com/v1/dolares/oficial`). El literal de `fuente` se mantiene
// `"dolartoday"` porque es lo que acepta el CHECK del schema (`packages/db/schema.sql`)
// y F3.3.T2 lo extraerá a `packages/lib/scrape/dolartoday.ts`.

import { load } from 'cheerio';
import https from 'node:https';

export const STALE_MS = 24 * 60 * 60 * 1000;

const BCV_URL = 'https://bcv.org.ve/';
const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

const BCV_SELECTOR = '#dolar .field-content .strong-tb';
const BCV_FECHA_SELECTOR = '.date-display-single';

// bcv.org.ve no bloquea por user-agent (S1), pero se usa un UA de navegador
// realista por convención y para evitar bloqueos futuros.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-VE,es;q=0.9,en;q=0.5',
};

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Backoff de reintentos del primario: 1 intento primario + 2 reintentos.
 * Delays fijos 1s y 3s (criterio de aceptación de F3.3.T1).
 */
const RETRY_DELAYS_MS = [1_000, 3_000];

// Rango de sanity-check de la tasa (Bs/USD). Un valor fuera de este rango
// indica MITM o parseo roto, no una tasa real.
const MIN_TASA = 1;
const MAX_TASA = 100_000;

export type TasaFuente = 'bcv' | 'dolartoday';

export interface ScrapeResult {
  tasa: number;
  /** Fecha valor: `content` de `.date-display-single` (BCV) o `fechaActualizacion` (fallback). */
  fecha: Date;
  scraped_at: Date;
  fuente: TasaFuente;
}

interface HttpsResponse {
  status: number;
  ok: boolean;
  body: string;
}

/**
 * Agente "laxo" SÓLO para bcv.org.ve (cadena TLS incompleta, ver cabecera).
 */
const bcvAgent = new https.Agent({ rejectUnauthorized: false });

function logEvent(event: string, data: Record<string, unknown> = {}): void {
  // Log estructurado. En Next (VPS) termina en stdout; el prefijo `scope`
  // permite filtrar/alertar con exact match (mismo contrato que S1).
  console.log(JSON.stringify({ scope: 'bcv.scrape', ts: Date.now(), event, ...data }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET https que devuelve `{ status, ok, body }`. Usa un agente custom para el
 * problema de cadena TLS incompleta de bcv.org.ve.
 */
function httpsGetText(
  url: string,
  opts: { headers: Record<string, string>; agent: https.Agent },
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<HttpsResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: opts.headers, agent: opts.agent }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          body,
        })
      );
    });
    req.setTimeout(timeoutMs, () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'timeout' }))
    );
    req.on('error', reject);
  });
}

/** fetch para el fallback DolarAPI (cadena TLS válida, `fetch` nativo funciona). */
async function fetchJson(url: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, ok: res.ok, json: await res.json() };
}

/**
 * Reintenta `fn` hasta `attempts` veces (1 primario + N reintentos) con los
 * delays fijos de `RETRY_DELAYS_MS`. Lanza el último error si todos fallan.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = RETRY_DELAYS_MS.length + 1, delaysMs = RETRY_DELAYS_MS } = {}
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        const delay = delaysMs[i] ?? delaysMs[delaysMs.length - 1] ?? 0;
        logEvent('retry', { attempt: i + 1, delay_ms: delay });
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * Normaliza y parsea la tasa es-VE (coma decimal, punto de miles).
 *   "784,66330000" -> 784.6633 | "1.234,56789" -> 1234.56789
 * Lanza si el resultado no es finito, es <= 0 o queda fuera del rango razonable.
 */
export function parseTasa(raw: string): number {
  const s = String(raw).replace(/\s/g, '');
  if (!s) throw new Error('tasa_invalida: vacío');

  const normalized = s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');

  const tasa = Number.parseFloat(normalized);
  if (!Number.isFinite(tasa) || tasa < MIN_TASA || tasa > MAX_TASA) {
    throw new Error(`tasa_invalida: "${raw}"`);
  }
  return tasa;
}

/** Medianoche de hoy en Venezuela (UTC-4, sin DST). Fallback de `fecha`. */
function todayVe(): Date {
  const now = new Date();
  const veTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return new Date(Date.UTC(veTime.getUTCFullYear(), veTime.getUTCMonth(), veTime.getUTCDate()));
}

function parseFecha(raw: string | undefined): Date | null {
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

/**
 * Scrapea `bcv.org.ve` (primario). Reintenta 3 veces (1 + 2, backoff 1s/3s).
 * Lanza un error con `code` explícito para distinguir "sitio caído" de
 * "HTML cambió" (ver S1 DECISION.md):
 *   - `bcv_http_error`   → 5xx/429/403/timeout
 *   - `bcv_html_changed` → 200 pero el selector ya no matchea
 */
export async function scrapeBcv({
  now = () => new Date(),
}: { now?: () => Date } = {}): Promise<ScrapeResult> {
  const { status, ok, body } = await withRetry(() =>
    httpsGetText(BCV_URL, { headers: BROWSER_HEADERS, agent: bcvAgent })
  );
  if (!ok) {
    throw Object.assign(new Error(`bcv.http_error ${status}`), { code: 'bcv_http_error', status });
  }

  const $ = load(body);
  const raw = $(BCV_SELECTOR).first().text().trim();
  if (!raw) {
    throw Object.assign(new Error(`bcv.html_changed: selector ${BCV_SELECTOR} vacío`), {
      code: 'bcv_html_changed',
    });
  }

  const tasa = parseTasa(raw);
  const fechaValor = $(BCV_FECHA_SELECTOR).first().attr('content');
  const fecha = parseFecha(fechaValor) ?? todayVe();

  logEvent('bcv.parse.ok', { tasa, fecha_valor: fechaValor ?? null });
  return { tasa, fecha, scraped_at: now(), fuente: 'bcv' };
}

/**
 * Fallback DolarAPI (S1): DolarToday está muerto. La fuente persistida es
 * `"dolartoday"` por compatibilidad con el CHECK del schema.
 * Lanza `dolarapi_http_error` o `dolarapi_parse_error`.
 */
export async function scrapeDolarToday({
  now = () => new Date(),
}: { now?: () => Date } = {}): Promise<ScrapeResult> {
  const { status, ok, json } = (await withRetry(() => fetchJson(DOLAR_API_URL))) as {
    status: number;
    ok: boolean;
    json: unknown;
  };

  if (!ok) {
    throw Object.assign(new Error(`dolarapi.http_error ${status}`), {
      code: 'dolarapi_http_error',
      status,
    });
  }

  const data = json as { promedio?: unknown; fechaActualizacion?: unknown } | null;
  const tasa = typeof data?.promedio === 'number' ? data.promedio : Number(data?.promedio);
  if (!Number.isFinite(tasa) || tasa < MIN_TASA || tasa > MAX_TASA) {
    throw Object.assign(new Error('dolarapi.parse_error: promedio ausente'), {
      code: 'dolarapi_parse_error',
    });
  }

  const fechaValor =
    typeof data?.fechaActualizacion === 'string' ? data.fechaActualizacion : undefined;
  const fecha = parseFecha(fechaValor) ?? todayVe();

  logEvent('fallback.parse.ok', { tasa, fecha_valor: fechaValor ?? null });
  return { tasa, fecha, scraped_at: now(), fuente: 'dolartoday' };
}
