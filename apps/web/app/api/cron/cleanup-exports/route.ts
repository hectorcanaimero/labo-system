import { NextRequest, NextResponse } from "next/server";

import { cleanupOlderThan } from "@labo/lib/storage-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("CRON_SECRET no configurado.");
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    const reqSecret = request.headers.get("x-cron-secret");
    if (!reqSecret || reqSecret !== cronSecret) {
      console.warn("Intento no autorizado de correr cleanup cron.");
      return new Response("Unauthorized", { status: 401 });
    }

    const deleted = await cleanupOlderThan("exports", SEVEN_DAYS_MS);

    return NextResponse.json({
      success: true,
      deleted_count: deleted.length,
      deleted_keys: deleted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Export cleanup cron job falló:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: message },
      { status: 500 },
    );
  }
}
