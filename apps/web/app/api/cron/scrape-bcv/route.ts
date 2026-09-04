import { NextResponse, type NextRequest } from "next/server";

import { setFromScraper } from "@labo/db/repos/tasa";
import { scrapeBcv, scrapeDolarToday } from "@labo/lib/scrape/bcv";
import type { ScrapeResult } from "@labo/lib/scrape/bcv";
import { getAdminDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCION_FALLO = "cron.scrape-bcv.failed";
const ENTITY_TYPE = "tasa_cambio_bcv";

/**
 * Cron BCV — dispara desde Coolify Scheduled Task cada 30 min:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://.../api/cron/scrape-bcv
 *
 * Patrón external-indicators (guayana-news):
 *   - Primario bcv.org.ve; fallback DolarAPI si falla.
 *   - Fail-closed: si ambos fallan, se registra audit warning pero NO se
 *     borra la última tasa (last-known-good).
 *   - Respuesta 200 aún en fallo, para que el crontab no reintente.
 */
function errorCode(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function auditWarning(
  primaryError: unknown,
  fallbackError: unknown,
): Promise<void> {
  try {
    const db = getAdminDb();
    await db.from("audit_log").insert({
      accion: ACCION_FALLO,
      entity_type: ENTITY_TYPE,
      metadata: {
        primary_code: errorCode(primaryError),
        primary_message: errorMessage(primaryError),
        fallback_code: errorCode(fallbackError),
        fallback_message: errorMessage(fallbackError),
      },
    });
  } catch (err) {
    console.error("audit_log fallback failed:", err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET no configurado.");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const reqSecret = request.headers.get("x-cron-secret");
  if (!reqSecret || reqSecret !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let result: ScrapeResult | null = null;
  let primaryError: unknown = null;
  let fallbackError: unknown = null;

  try {
    result = await scrapeBcv();
  } catch (err) {
    primaryError = err;
    console.error("bcv.org.ve falló:", errorMessage(err));
  }

  if (!result) {
    try {
      result = await scrapeDolarToday();
    } catch (err) {
      fallbackError = err;
      console.error("Fallback DolarAPI falló:", errorMessage(err));
    }
  }

  if (!result) {
    await auditWarning(primaryError, fallbackError);
    return NextResponse.json(
      {
        success: false,
        error: "bcv_scrape_failed",
        primary_code: errorCode(primaryError),
        fallback_code: errorCode(fallbackError),
      },
      { status: 200 },
    );
  }

  try {
    const outcome = await setFromScraper(getAdminDb(), {
      tasa: result.tasa,
      fuente: result.fuente,
      fecha: result.fecha.toISOString(),
      scrapedAt: result.scraped_at.toISOString(),
    });

    if (outcome.skipped) {
      // El rechazo por outlier no dejaba traza: el cron corría cada hora, devolvía
      // 200 y la tasa nunca se movía, sin nada que mirar en audit_log.
      await auditWarning(
        Object.assign(new Error(outcome.reason ?? "rejected_outlier"), {
          code: "rejected_outlier",
        }),
        `tasa_intentada=${result.tasa} fuente=${result.fuente}`,
      );
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: outcome.reason,
        tasa: result.tasa,
        fuente: result.fuente,
      });
    }

    return NextResponse.json({
      success: true,
      id: outcome.id,
      tasa: result.tasa,
      fuente: result.fuente,
    });
  } catch (err) {
    console.error("Persistencia de tasa falló:", err);
    await auditWarning(err, "persist_failed");
    return NextResponse.json(
      { success: false, error: "persist_failed", details: errorMessage(err) },
      { status: 200 },
    );
  }
}
