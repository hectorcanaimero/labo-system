// F3.3.T2 — Fallback DolarToday (módulo puro, paquete hoja ADR-08).
//
// Segunda fuente de tasa cuando `bcv.org.ve` falla (ver F3.3.T1). Extraído a
// su propio módulo para que el Route Handler pueda elegir primario/fallback
// sin acoplar ambos scrapers en un solo archivo.
//
// Hallazgo clave (S1 DECISION.md, validado 2026-08-23): DolarToday está MUERTO.
// Se usa DolarAPI (`ve.dolarapi.com/v1/dolares/oficial`), cuya cadena TLS es
// válida, por lo que `fetch` nativo alcanza (sin agente "laxo"). El literal de
// `fuente` se mantiene `"dolartoday"` porque es lo que acepta el CHECK del
// schema (`packages/db/schema.sql`) y el contrato del endpoint `GET /tasa`.
//
// No accede a DB ni a Next: sólo fetch + parse + retry. La persistencia y el
// audit log viven en el Route Handler `apps/web/app/api/cron/scrape-bcv/route.ts`
// (reutiliza el repo de tasa: INSERT en `tasa_cambio_bcv` con `fuente`).

export const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

export type TasaFuente = 'bcv' | 'dolartoday';

export interface ScrapeResult {
  tasa: number;
  /** Fecha valor: `fechaActualizacion` de la respuesta. */
  fecha: Date;
  scraped_at: Date;
  fuente: TasaFuente;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Backoff de reintentos del fallback: 1 intento primario + 2 reintentos.
 * Delays fijos 1s y 3s (mismo contrato que F3.3.T1).
 */
const RETRY_DELAYS_MS = [1_000, 3_000];

// Rango de sanity-check de la tasa (Bs/USD). Un valor fuera de este rango
// indica MITM o parseo roto, no una tasa real.
const MIN_TASA = 1;
const MAX_TASA = 100_000;

function logEvent(event: string, data: Record<string, unknown> = {}): void {
  // Log estructurado. En Next (VPS) termina en stdout; el prefijo `scope`
  // permite filtrar/alertar con exact match (mismo contrato que S1).
  console.log(JSON.stringify({ scope: 'dolartoday.scrape', ts: Date.now(), event, ...data }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** fetch JSON para el fallback DolarAPI (cadena TLS válida, `fetch` nativo funciona). */
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
 * Fallback DolarAPI (S1): DolarToday está muerto. La fuente persistida es
 * `"dolartoday"` por compatibilidad con el CHECK del schema y el endpoint
 * `GET /tasa`. Retry 3 veces (1 + 2, backoff 1s/3s).
 * Lanza un error con `code` explícito:
 *   - `dolarapi_http_error` → 5xx/429/403/timeout
 *   - `dolarapi_parse_error` → 200 pero el JSON no trae `promedio` válido
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
