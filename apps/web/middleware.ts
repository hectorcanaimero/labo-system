import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware Next.js (F0.2.T8 — ADR-11, revisado F6.1.T3).
 *
 * Guard coarse-grained SOLO por presencia de cookie de sesión. Sin fetch a
 * `/api/me` ni validación de rol acá — eso lo hacen los layouts/páginas
 * server-side (`getCurrentUser` / `requireRole`) y los Route Handlers.
 *
 * ¿Por qué? El Edge runtime no puede tocar la DB (rol vive en `usuarios`) y
 * el self-fetch al mismo origin explota en containers detrás de proxy inverso
 * (Coolify/Traefik) con `ERR_SSL_WRONG_VERSION_NUMBER`: el DNS interno
 * resuelve al puerto HTTP del container y Node intenta TLS handshake.
 *
 * Rutas públicas: `/`, `/forgot-password`, `/reset-password`, `/accept-invite`.
 * Resto: exige cookie; si no hay, redirect a `/`.
 */

const ACCESS_COOKIE_NAME =
  process.env.INSFORGE_ACCESS_COOKIE ?? "insforge-access-token";

const PUBLIC_ROUTES = [
  "/",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
] as const;

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) =>
      pathname === route ||
      (route !== "/" && pathname.startsWith(`${route}/`)),
  );
}

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const hasSessionCookie =
    (request.cookies.get(ACCESS_COOKIE_NAME)?.value?.length ?? 0) > 0;

  if (!hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Excluye estáticos de Next, archivos con extensión, `/api/pdf/*`,
   * `/api/cron/*`, `/api/me` y `/api/auth/reset` (todos validan sesión /
   * secret internamente).
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/pdf|api/cron|api/me|api/auth/reset).*)",
  ],
};
