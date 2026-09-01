import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";
import {
  AiError,
  isAiObservacionesEnabled,
  sugerirObservacion,
} from "@/lib/ai/gemini";
import { checkRateLimit } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ai/observaciones
//
// Body: { texto: string (1..2000 chars) }
// Response 200: { sugerencia: string, modelo: string, latency_ms: number }
// Response 4xx/5xx: { error: <code>, message?: string, retry_after_sec?: number }
//
// Auth: cualquier usuario autenticado y activo. Rate limit 10 req/min por
// usuario (in-memory). Cada uso queda en audit_log con acción
// `ai.observaciones.sugerido` y metadata (longitudes, modelo, latencia).
// Nunca se persiste el texto — solo métricas y estado.

const BodySchema = z.object({
  texto: z.string().trim().min(1, "El texto no puede estar vacío."),
});

async function auditEvent(
  usuarioId: string,
  accion: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const db = getAdminDb();
    await db.from("audit_log").insert({
      usuario_id: usuarioId,
      accion,
      entity_type: "ai.observaciones",
      metadata,
    });
  } catch (err) {
    console.error("audit_log ai.observaciones failed:", err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAiObservacionesEnabled()) {
    return NextResponse.json(
      { error: "AI_DISABLED", message: "Asistente deshabilitado." },
      { status: 503 },
    );
  }

  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: err.code }, { status });
    }
    throw err;
  }

  const rl = checkRateLimit(user.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta nuevamente en unos segundos.",
        retry_after_sec: rl.retryAfterSec,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "El body debe ser JSON válido." },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Input inválido." },
      { status: 400 },
    );
  }

  try {
    const result = await sugerirObservacion(parsed.data.texto);
    await auditEvent(user.userId, "ai.observaciones.sugerido", {
      modelo: result.modelo,
      input_chars: result.inputChars,
      output_chars: result.outputChars,
      latency_ms: result.latencyMs,
    });
    return NextResponse.json({
      sugerencia: result.sugerencia,
      modelo: result.modelo,
      latency_ms: result.latencyMs,
    });
  } catch (err) {
    if (err instanceof AiError) {
      const status =
        err.code === "AI_INPUT_INVALID"
          ? 400
          : err.code === "AI_DISABLED"
          ? 503
          : err.code === "AI_TIMEOUT"
          ? 504
          : 502;
      await auditEvent(user.userId, "ai.observaciones.error", {
        code: err.code,
        message: err.message,
      });
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    console.error("ai.observaciones unexpected error:", err);
    await auditEvent(user.userId, "ai.observaciones.error", {
      code: "INTERNAL",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
