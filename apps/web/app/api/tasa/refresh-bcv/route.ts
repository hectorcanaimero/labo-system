import { NextResponse } from "next/server";

import { setFromScraper } from "@labo/db/repos/tasa";
import { scrapeBcv, scrapeDolarToday } from "@labo/lib/scrape/bcv";
import type { ScrapeResult } from "@labo/lib/scrape/bcv";
import { AuthError, requireRole } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refresh manual de la tasa BCV desde la UI (admin).
 *
 * A diferencia del cron, este endpoint responde 4xx/5xx con `error` explícito
 * para que el frontend pueda mostrar el motivo del fallo (timeout, HTML cambió,
 * variación fuera de rango, etc.). Reusa el mismo scraper y las mismas guardas
 * `setFromScraper` (fail-closed, MAX_CHANGE_RATIO, LKG intacto).
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

export async function POST(): Promise<Response> {
  try {
    const user = await requireRole("admin");

    let result: ScrapeResult | null = null;
    let primaryError: unknown = null;
    let fallbackError: unknown = null;

    try {
      result = await scrapeBcv();
    } catch (err) {
      primaryError = err;
    }

    if (!result) {
      try {
        result = await scrapeDolarToday();
      } catch (err) {
        fallbackError = err;
      }
    }

    if (!result) {
      return NextResponse.json(
        {
          error: "SCRAPE_FAILED",
          primary_code: errorCode(primaryError),
          primary_message: errorMessage(primaryError),
          fallback_code: errorCode(fallbackError),
          fallback_message: errorMessage(fallbackError),
        },
        { status: 502 },
      );
    }

    const outcome = await setFromScraper(getAdminDb(), {
      tasa: result.tasa,
      fuente: result.fuente,
      fecha: result.fecha.toISOString(),
      scrapedAt: result.scraped_at.toISOString(),
      usuarioId: user.userId,
    });

    if (outcome.skipped) {
      return NextResponse.json(
        {
          error: "REJECTED_OUTLIER",
          reason: outcome.reason,
          tasa_intentada: result.tasa,
          fuente: result.fuente,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: outcome.id,
      tasa: result.tasa,
      fuente: result.fuente,
      scraped_at: result.scraped_at.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }
    console.error("refresh-bcv error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
