// Rate limit in-memory por usuario para el asistente de observaciones.
//
// Sliding window simple: hasta MAX_HITS peticiones cada WINDOW_MS.
// Suficiente para un lab con 1 pod. Si se escala horizontalmente, migrar
// a Redis/Upstash — pero mientras el deploy sea single-pod (Coolify), esto
// vive en memoria del proceso Node.

const WINDOW_MS = 60_000;
const MAX_HITS = 10;

const hits = new Map<string, number[]>();

export interface RateLimitOutcome {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function checkRateLimit(userId: string): RateLimitOutcome {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (hits.get(userId) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= MAX_HITS) {
    hits.set(userId, timestamps);
    const oldest = timestamps[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  timestamps.push(now);
  hits.set(userId, timestamps);
  return {
    allowed: true,
    remaining: MAX_HITS - timestamps.length,
    retryAfterSec: 0,
  };
}
