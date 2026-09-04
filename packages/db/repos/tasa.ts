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
const ENTITY_TYPE = "tasa_cambio_bcv";
const MAX_CHANGE_RATIO = Number(process.env.BCV_MAX_CHANGE_RATIO ?? "0.5");

function normalizeTasa(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
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
 */
export async function setManual(
  db: Db,
  input: SetManualTasaInput,
): Promise<string> {
  const motivo = input.motivo?.trim();
  const nowIso = new Date().toISOString();

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
      motivo: motivo ?? null,
      fuente: "manual",
    },
  });
  if (auditError) console.warn(`[audit ${AUDIT_ACTION}]`, auditError.message);

  return tasaId;
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
