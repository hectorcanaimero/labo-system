import type { NextRequest } from "next/server";

/**
 * Origen público de la app, para armar URLs absolutas (enlaces de resultado,
 * QR de verificación).
 *
 * En el VPS la app corre detrás de Traefik, así que `request.url` trae el host
 * interno del container: hay que mirar los headers `x-forwarded-*`.
 * `NEXT_PUBLIC_APP_URL` lo pisa todo si está definida.
 */
export function publicOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  return `${proto}://${host}`;
}
