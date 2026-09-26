// Adquisición de la tasa USD/VES: bcv.org.ve directo, con DolarAPI de respaldo.
//
// DolarAPI va atrasada: cuando BCV publica en la tarde la tasa del siguiente
// día hábil, DolarAPI sigue devolviendo la anterior por horas, y el dashboard
// mostraba una tasa vieja. Por eso primero se lee bcv.org.ve.
//
// Endpoints directos (un objeto por llamada, sin array):
//   https://ve.dolarapi.com/v1/dolares/oficial
//   https://ve.dolarapi.com/v1/dolares/paralelo
//
// { moneda, fuente, nombre, compra, venta, promedio, fechaActualizacion }
//
// Reemplaza el scraping directo de bcv.org.ve (cadena TLS incompleta + selector
// frágil). DolarAPI expone la MISMA tasa que publica BCV bajo `oficial`, con
// TLS válido y JSON estable — `fetch` nativo alcanza.
//
// Estrategia (patrón external-indicators de guayana-news):
//   - scrapeBcv() -> GET /oficial (equivale a la tasa BCV)
//   - scrapeDolarToday() -> fallback: GET /paralelo
//   - Retries acotados en timeout/5xx, backoff 1s / 3s
//   - Sanity check de rango; fail-closed si falta el campo o es inválido
//   - La persistencia guarda `fuente: "bcv"` para oficial y `"dolartoday"` para
//     paralelo (compat con el CHECK del schema).

import https from "node:https";
import tls from "node:tls";

export const STALE_MS = 24 * 60 * 60 * 1000;

const BCV_URL = "https://www.bcv.org.ve/";

// bcv.org.ve no envía el intermedio de su certificado (manda otro que no lo
// firma), así que Node rechaza la conexión. Lo agregamos a mano. Vence en 2036;
// si BCV cambia de CA, el scraper cae a DolarAPI y queda el log `bcv.fallback`.
const SECTIGO_DV_R36 = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----`;

const DOLAR_API_BASE = "https://ve.dolarapi.com/v1/dolares";
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

async function fetchDolarEntry(fuente: "oficial" | "paralelo"): Promise<DolarApiEntry> {
  const res = await fetch(`${DOLAR_API_BASE}/${fuente}`, {
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
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw Object.assign(new Error("dolarapi.parse_error: respuesta no es objeto"), {
      code: "dolarapi_parse_error",
    });
  }
  return json as DolarApiEntry;
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

function fetchBcvHtml(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      BCV_URL,
      { ca: [...tls.rootCertificates, SECTIGO_DV_R36], timeout: REQUEST_TIMEOUT_MS },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(Object.assign(new Error(`bcv.http_error ${res.statusCode}`), { code: "bcv_http_error" }));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve(body));
      },
    );
    req.on("timeout", () => req.destroy(new Error("bcv.timeout")));
    req.on("error", reject);
  });
}

/** Extrae la tasa USD y la fecha valor del HTML de bcv.org.ve. */
export function parseBcvHtml(html: string): { tasa: number; fecha: Date | null } {
  const raw = html.match(/id="dolar"[\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/)?.[1];
  if (!raw) {
    throw Object.assign(new Error("bcv.parse_error: no se encontró la tasa USD"), {
      code: "bcv_parse_error",
    });
  }
  const fecha = parseFecha(html.match(/Fecha Valor:[\s\S]*?content="([^"]+)"/)?.[1]);
  return { tasa: parseTasa(raw), fecha };
}

/**
 * Tasa OFICIAL BCV: bcv.org.ve y, si falla, DolarAPI `/oficial`. Retries acotados.
 * Códigos:
 *   - `dolarapi_http_error` → 5xx/429/403/timeout
 *   - `dolarapi_parse_error` → JSON inválido / no es objeto
 *   - `tasa_invalida` → `promedio` fuera de rango o no numérico
 */
export async function scrapeBcv({
  now = () => new Date(),
}: { now?: () => Date } = {}): Promise<ScrapeResult> {
  try {
    const { tasa, fecha } = parseBcvHtml(await withRetry(fetchBcvHtml));
    logEvent("bcv.parse.ok", { tasa, fecha_valor: fecha?.toISOString() ?? null });
    return { tasa, fecha: fecha ?? todayVe(), scraped_at: now(), fuente: "bcv" };
  } catch (err) {
    logEvent("bcv.fallback", { error: err instanceof Error ? err.message : String(err) });
  }

  const oficial = await withRetry(() => fetchDolarEntry("oficial"));
  const tasa = parseTasa(oficial.promedio);
  const fecha = parseFecha(oficial.fechaActualizacion) ?? todayVe();
  logEvent("oficial.parse.ok", { tasa, fecha_valor: oficial.fechaActualizacion ?? null });
  return { tasa, fecha, scraped_at: now(), fuente: "bcv" };
}

/**
 * Fallback PARALELO via DolarAPI. Se usa sólo si `oficial` falló.
 * La `fuente` persistida es `"dolartoday"` por compat con el CHECK del schema.
 */
export async function scrapeDolarToday({
  now = () => new Date(),
}: { now?: () => Date } = {}): Promise<ScrapeResult> {
  const paralelo = await withRetry(() => fetchDolarEntry("paralelo"));
  const tasa = parseTasa(paralelo.promedio);
  const fecha = parseFecha(paralelo.fechaActualizacion) ?? todayVe();
  logEvent("paralelo.parse.ok", { tasa, fecha_valor: paralelo.fechaActualizacion ?? null });
  return { tasa, fecha, scraped_at: now(), fuente: "dolartoday" };
}
