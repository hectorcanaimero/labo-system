import type { Db } from "../sdk";

export type TasaFuente = "bcv" | "dolartoday" | "manual";

export interface LatestTasa {
  tasa: number;
  fuente: TasaFuente;
  scraped_at: string;
  motivo: string | null;
  stale: boolean;
}

export interface SetManualTasaInput {
  tasa: number;
  motivo?: string;
  usuarioId: string;
  /**
   * Salta la guarda anti-outlier. Es la salida del admin cuando la tasa se
   * movió de verdad más que el umbral: sin esto la carga manual queda
   * bloqueada hasta que el LKG se ponga stale (24h), y el scraper tampoco
   * puede refrescarlo porque tiene la misma guarda.
   *
   * Exige `motivo`: forzar sin dejar dicho por qué no deja auditar nada útil.
   */
  force?: boolean;
}

export interface SetFromScraperInput {
  tasa: number;
  fuente: Exclude<TasaFuente, "manual">;
  fecha: string;
  scrapedAt: string;
  usuarioId?: string;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const AUDIT_ACTION = "tasa.setManual";
const AUDIT_ACTION_SCRAPER = "tasa.setFromScraper";
/** Rechazos de la guarda anti-outlier: dejan rastro aunque no escriban tasa. */
const AUDIT_ACTION_RECHAZO = "tasa.rechazadaOutlier";

/** Forzar la carga manual sin explicar por qué no se audita: se rechaza. */
export const MOTIVO_REQUERIDO_PARA_FORZAR = "MOTIVO_REQUERIDO_PARA_FORZAR";
const ENTITY_TYPE = "tasa_cambio_bcv";
const MAX_CHANGE_RATIO = Number(process.env.BCV_MAX_CHANGE_RATIO ?? "0.5");

function normalizeTasa(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

/**
 * Deja constancia de un rechazo de la guarda anti-outlier.
 *
 * El rechazo no escribe tasa, así que sin esto no queda ningún rastro de que
 * alguien intentó cargar un valor y el sistema lo frenó — que es justo la
 * evidencia que hace falta cuando el operador reporta "la tasa no funciona".
 */
async function auditarRechazo(
  db: Db,
  row: {
    usuarioId: string | null;
    fuente: TasaFuente;
    tasaIntentada: number;
    tasaAnterior: number;
    ratio: number;
  },
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    usuario_id: row.usuarioId,
    accion: AUDIT_ACTION_RECHAZO,
    entity_type: ENTITY_TYPE,
    entity_id: null,
    metadata: {
      fuente: row.fuente,
      tasa_intentada: row.tasaIntentada,
      tasa_anterior: row.tasaAnterior,
      ratio: Number(row.ratio.toFixed(4)),
      umbral: MAX_CHANGE_RATIO,
    },
  });
  if (error) console.warn(`[audit ${AUDIT_ACTION_RECHAZO}]`, error.message);
}

/**
 * Retorna el último registro de `tasa_cambio_bcv`.
 * - `null` si la tabla está vacía.
 * - `stale: true` si supera las 24h desde `scraped_at`.
 */
export async function getLatest(db: Db): Promise<LatestTasa | null> {
  const { data, error } = await db
    .from("tasa_cambio_bcv")
    .select("tasa, fuente, scraped_at, motivo")
    .order("fecha", { ascending: false })
    .order("scraped_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`tasa.getLatest: ${error.message}`);
  const latest = data?.[0] as
    | { tasa: string | number; fuente: TasaFuente; scraped_at: string; motivo: string | null }
    | undefined;
  if (!latest) return null;

  return {
    tasa: normalizeTasa(latest.tasa),
    fuente: latest.fuente,
    scraped_at: latest.scraped_at,
    motivo: latest.motivo,
    stale: Date.now() - new Date(latest.scraped_at).getTime() > STALE_THRESHOLD_MS,
  };
}

/**
 * Override manual de la tasa. INSERT en `tasa_cambio_bcv` + audit best-effort.
 *
 * Aplica la misma guarda anti-outlier que `setFromScraper` (variación >
 * `MAX_CHANGE_RATIO` vs LKG no-stale => rechaza). Antes no existía ninguna:
 * cualquier valor se guardaba con éxito silencioso, incluida una tasa
 * cargada con un error de tipeo.
 *
 * `force: true` (con `motivo` obligatorio) salta la guarda: es la salida del
 * admin cuando la tasa realmente se movió más que el umbral. Sin eso la carga
 * manual quedaba bloqueada hasta que el LKG se pusiera stale a las 24h, y el
 * scraper tampoco podía refrescarlo porque comparte la guarda.
 *
 * Todo queda auditado: el rechazo, el forzado y la carga normal.
 */
export async function setManual(
  db: Db,
  input: SetManualTasaInput,
): Promise<{ id: string | null; skipped: boolean; reason?: string; tasaAnterior?: number }> {
  const motivo = input.motivo?.trim();
  const nowIso = new Date().toISOString();
  const forzado = input.force === true;

  if (forzado && !(motivo && motivo.length > 0)) {
    throw new Error(MOTIVO_REQUERIDO_PARA_FORZAR);
  }

  const previous = await getLatest(db);
  let fueraDeRango = false;
  if (previous && !previous.stale && previous.tasa > 0 && MAX_CHANGE_RATIO > 0) {
    const ratio = Math.abs(input.tasa - previous.tasa) / previous.tasa;
    if (ratio > MAX_CHANGE_RATIO) {
      fueraDeRango = true;
      if (!forzado) {
        await auditarRechazo(db, {
          usuarioId: input.usuarioId,
          fuente: "manual",
          tasaIntentada: input.tasa,
          tasaAnterior: previous.tasa,
          ratio,
        });
        return {
          id: null,
          skipped: true,
          reason: `variacion_${ratio.toFixed(3)}_sobre_${MAX_CHANGE_RATIO}`,
          tasaAnterior: previous.tasa,
        };
      }
    }
  }

  const { data, error } = await db
    .from("tasa_cambio_bcv")
    .insert({
      tasa: input.tasa,
      fecha: nowIso,
      fuente: "manual",
      scraped_at: nowIso,
      motivo: motivo && motivo.length > 0 ? motivo : null,
      created_by: input.usuarioId,
    })
    .select("id")
    .limit(1);
  if (error) throw new Error(`tasa.setManual: ${error.message}`);
  const tasaId = (data?.[0] as { id: string } | undefined)?.id;
  if (!tasaId) throw new Error("No se pudo crear la tasa manual.");

  const { error: auditError } = await db.from("audit_log").insert({
    usuario_id: input.usuarioId,
    accion: AUDIT_ACTION,
    entity_type: ENTITY_TYPE,
    entity_id: tasaId,
    metadata: {
      tasa: input.tasa,
      tasa_anterior: previous?.tasa ?? null,
      motivo: motivo ?? null,
      fuente: "manual",
      forzado,
      // `true` sólo cuando además se saltó la guarda: distingue un forzado que
      // hacía falta de uno que igual estaba dentro de rango.
      fuera_de_rango: fueraDeRango,
    },
  });
  if (auditError) console.warn(`[audit ${AUDIT_ACTION}]`, auditError.message);

  return { id: tasaId, skipped: false };
}

/**
 * Persistencia desde scraper (BCV o fallback). Aplica guardas del patrón
 * external-indicators de guayana-news:
 *   - fail-closed: si `tasa` es inválida, tira (no persiste).
 *   - anti-outlier: variación > `MAX_CHANGE_RATIO` vs LKG => rechaza, salvo que
 *     el LKG esté stale (>24h) — ver comentario en el cuerpo.
 *   - last-known-good: nunca se escribe `null` ni se borra la tasa previa.
 *
 * Retorna `{ id, skipped: false }` si insertó, o `{ id: null, skipped: true, reason }`
 * si el guardián rechazó el valor.
 */
export async function setFromScraper(
  db: Db,
  input: SetFromScraperInput,
): Promise<{ id: string | null; skipped: boolean; reason?: string }> {
  if (!Number.isFinite(input.tasa) || input.tasa <= 0) {
    throw new Error(`tasa.setFromScraper: tasa inválida (${input.tasa})`);
  }

  const previous = await getLatest(db);
  // ponytail: la guarda anti-outlier se desactiva cuando el LKG está stale (>24h).
  // Sin esto la guarda se auto-bloquea: si el rechazo no escribe nada, el LKG viejo
  // queda fijo y TODO scrape posterior vuelve a caer fuera de rango, para siempre.
  // Una tasa que no se actualiza hace más de un día ya no es una referencia confiable.
  if (previous && !previous.stale && previous.tasa > 0 && MAX_CHANGE_RATIO > 0) {
    const ratio = Math.abs(input.tasa - previous.tasa) / previous.tasa;
    if (ratio > MAX_CHANGE_RATIO) {
      await auditarRechazo(db, {
        usuarioId: input.usuarioId ?? null,
        fuente: input.fuente,
        tasaIntentada: input.tasa,
        tasaAnterior: previous.tasa,
        ratio,
      });
      return {
        id: null,
        skipped: true,
        reason: `variacion_${ratio.toFixed(3)}_sobre_${MAX_CHANGE_RATIO}`,
      };
    }
  }

  const { data, error } = await db
    .from("tasa_cambio_bcv")
    .insert({
      tasa: input.tasa,
      fecha: input.fecha,
      fuente: input.fuente,
      scraped_at: input.scrapedAt,
      motivo: null,
      created_by: input.usuarioId ?? null,
    })
    .select("id")
    .limit(1);
  if (error) throw new Error(`tasa.setFromScraper: ${error.message}`);
  const tasaId = (data?.[0] as { id: string } | undefined)?.id;
  if (!tasaId) throw new Error("tasa.setFromScraper: insert sin id");

  const { error: auditError } = await db.from("audit_log").insert({
    usuario_id: input.usuarioId ?? null,
    accion: AUDIT_ACTION_SCRAPER,
    entity_type: ENTITY_TYPE,
    entity_id: tasaId,
    metadata: {
      tasa: input.tasa,
      fuente: input.fuente,
      previous: previous?.tasa ?? null,
    },
  });
  if (auditError) console.warn(`[audit ${AUDIT_ACTION_SCRAPER}]`, auditError.message);

  return { id: tasaId, skipped: false };
}
