// Adquisición de la tasa USD/VES desde DolarAPI Venezuela.
//
// Endpoint: https://ve.dolarapi.com/v1/dolares
//   [
//     { fuente: "oficial",  nombre: "Dólar",    promedio: 791.67,  fechaActualizacion: "..." },
//     { fuente: "paralelo", nombre: "Paralelo", promedio: 922.97,  fechaActualizacion: "..." }
//   ]
//
// Reemplaza el scraping directo de bcv.org.ve (cadena TLS incompleta + selector
// frágil). DolarAPI expone la MISMA tasa que publica BCV bajo `fuente=oficial`,
// con TLS válido y JSON estable — `fetch` nativo alcanza.
//
// Estrategia (patrón external-indicators de guayana-news):
//   - scrapeBcv() -> busca la entrada `oficial` (equivale a la tasa BCV)
//   - scrapeDolarToday() -> fallback: busca la entrada `paralelo`
//   - Retries acotados en timeout/5xx, backoff 1s / 3s
//   - Sanity check de rango; fail-closed si falta el campo o es inválido
//   - La persistencia guarda `fuente: "bcv"` para oficial y `"dolartoday"` para
//     paralelo (compat con el CHECK del schema).

export const STALE_MS = 24 * 60 * 60 * 1000;

const DOLAR_API_URL = "https://ve.dolarapi.com/v1/dolares";
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000];

// Rango razonable Bs/USD. Un valor fuera indica endpoint corrupto, no una tasa real.
const MIN_TASA = 1;
const MAX_TASA = 100_000;

export type TasaFuente = "bcv" | "dolartoday";

export interface ScrapeResult {
  tasa: number;
  /** Fecha valor tal como la reporta la fuente (`fechaActualizacion`). */
  fecha: Date;
  scraped_at: Date;
  fuente: TasaFuente;
}

interface DolarApiEntry {
  moneda?: string;
  fuente?: string;
  nombre?: string;
  compra?: number | null;
  venta?: number | null;
  promedio?: number | string | null;
  fechaActualizacion?: string;
}

function logEvent(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ scope: "bcv.scrape", ts: Date.now(), event, ...data }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = RETRY_DELAYS_MS.length + 1, delaysMs = RETRY_DELAYS_MS } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        const delay = delaysMs[i] ?? delaysMs[delaysMs.length - 1] ?? 0;
        logEvent("retry", { attempt: i + 1, delay_ms: delay });
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function fetchDolarApi(): Promise<DolarApiEntry[]> {
  const res = await fetch(DOLAR_API_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`dolarapi.http_error ${res.status}`), {
      code: "dolarapi_http_error",
      status: res.status,
    });
  }
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) {
    throw Object.assign(new Error("dolarapi.parse_error: respuesta no es array"), {
      code: "dolarapi_parse_error",
    });
  }
  return json as DolarApiEntry[];
}

/**
 * Normaliza el `promedio` (number o string es-VE) a number finito y en rango.
 * Lanza si es inválido para fail-closed en la capa persistente.
 */
export function parseTasa(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) throw new Error("tasa_invalida: vacío");
  let tasa: number;
  if (typeof raw === "number") {
    tasa = raw;
  } else {
    const s = String(raw).replace(/\s/g, "");
    if (!s) throw new Error("tasa_invalida: vacío");
    const normalized = s.includes(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(",", ".");
    tasa = Number.parseFloat(normalized);
  }
  if (!Number.isFinite(tasa) || tasa < MIN_TASA || tasa > MAX_TASA) {
    throw new Error(`tasa_invalida: "${raw}"`);
  }
  return tasa;
}

function parseFecha(raw: string | undefined): Date | null {
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

/** Medianoche de hoy en Venezuela (UTC-4, sin DST). Fallback de `fecha`. */
function todayVe(): Date {
  const now = new Date();
  const veTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(veTime.getUTCFullYear(), veTime.getUTCMonth(), veTime.getUTCDate()),
  );
}

function pickEntry(entries: DolarApiEntry[], fuente: string): DolarApiEntry | null {
  return entries.find((e) => e.fuente?.toLowerCase() === fuente) ?? null;
}

/**
 * Tasa OFICIAL (equivalente a BCV) via DolarAPI. Retries acotados.
 * Códigos:
 *   - `dolarapi_http_error` → 5xx/429/403/timeout
 *   - `dolarapi_parse_error` → JSON inválido o `oficial` ausente
 *   - `tasa_invalida` → `promedio` fuera de rango o no numérico
 */
export async function scrapeBcv({
  now = () => new Date(),
}: { now?: () => Date } = {}): Promise<ScrapeResult> {
  const entries = await withRetry(() => fetchDolarApi());
  const oficial = pickEntry(entries, "oficial");
  if (!oficial) {
    throw Object.assign(new Error("dolarapi.parse_error: entrada 'oficial' ausente"), {
      code: "dolarapi_parse_error",
    });
  }
  const tasa = parseTasa(oficial.promedio);
  const fecha = parseFecha(oficial.fechaActualizacion) ?? todayVe();
  logEvent("oficial.parse.ok", { tasa, fecha_valor: oficial.fechaActualizacion ?? null });
  return { tasa, fecha, scraped_at: now(), fuente: "bcv" };
}

/**
 * Fallback PARALELO via DolarAPI (misma llamada). Se usa sólo si `oficial` falló.
 * La `fuente` persistida es `"dolartoday"` por compat con el CHECK del schema.
 */
export async function scrapeDolarToday({
  now = () => new Date(),
}: { now?: () => Date } = {}): Promise<ScrapeResult> {
  const entries = await withRetry(() => fetchDolarApi());
  const paralelo = pickEntry(entries, "paralelo");
  if (!paralelo) {
    throw Object.assign(new Error("dolarapi.parse_error: entrada 'paralelo' ausente"), {
      code: "dolarapi_parse_error",
    });
  }
  const tasa = parseTasa(paralelo.promedio);
  const fecha = parseFecha(paralelo.fechaActualizacion) ?? todayVe();
  logEvent("paralelo.parse.ok", { tasa, fecha_valor: paralelo.fechaActualizacion ?? null });
  return { tasa, fecha, scraped_at: now(), fuente: "dolartoday" };
}
