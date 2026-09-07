import { NextResponse, type NextRequest } from "next/server";

import { decidirRenovacion } from "@labo/lib/sesion-jwt";

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
 * Rutas públicas: `/`, `/forgot-password`, `/reset-password`, `/accept-invite`,
 * `/r/{slug}` (ficha de resultados que se comparte con el paciente, GUR-18:
 * el slug es la credencial, no hay sesión), `/v/{slug}` (verificación del
 * informe por QR, F7.3.T2) y `/p/{slug}` (ficha pública de un presupuesto,
 * F7.2.T7, mismo trato que `/r`).
 *
 * `isPublicRoute` compara por segmento (`=== route` o `startsWith(route + "/")`),
 * así que un prefijo corto como `/v` NO abre `/verificar-algo`. La lista de
 * exclusiones del `matcher` de abajo sí es por prefijo crudo: ahí hay que
 * cuidar la barra final.
 * Resto: exige cookie; si no hay, redirect a `/`.
 */

const ACCESS_COOKIE_NAME =
  process.env.INSFORGE_ACCESS_COOKIE ?? "insforge-access-token";
const REFRESH_COOKIE_NAME =
  process.env.INSFORGE_REFRESH_COOKIE ?? "insforge-refresh-token";
/** Igual que el login (`api/me`): 8 horas. */
const SESSION_MAX_AGE_S = 8 * 60 * 60;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  };
}

/**
 * Renovación transparente del access token (F7.8.T1).
 *
 * El login guarda las cookies por 8 horas, pero el access token de InsForge
 * es un JWT con vencimiento propio y más corto. Si nadie lo renueva, la
 * sesión "de 8 horas" dura lo que dure el JWT y el usuario vuelve al login a
 * mitad de trabajo. Acá, antes de dejar pasar una ruta protegida, se lee el
 * `exp` del token (sin verificar firma: sólo decide si renovar) y, si vence
 * en menos de 5 minutos, se pide uno nuevo con el refresh token y se
 * reescriben las cookies en la respuesta. Si el refresh también falla, se
 * limpian las cookies y se vuelve al login con `?motivo=expiro`.
 */
async function renovarAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string } | null> {
  const baseUrl = process.env.INSFORGE_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/api/auth/refresh?client_type=mobile`, {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json().catch(() => ({}))) as {
      accessToken?: string;
      refreshToken?: string;
      session?: { access_token?: string; refresh_token?: string };
    };
    const accessToken = payload.accessToken ?? payload.session?.access_token;
    if (!accessToken) return null;
    return { accessToken, refreshToken: payload.refreshToken ?? payload.session?.refresh_token };
  } catch {
    return null;
  }
}

function redirigirAlLogin(request: NextRequest, motivo?: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = motivo ? `?motivo=${motivo}` : "";
  const res = NextResponse.redirect(url);
  if (motivo) {
    res.cookies.delete(ACCESS_COOKIE_NAME);
    res.cookies.delete(REFRESH_COOKIE_NAME);
  }
  return res;
}

const PUBLIC_ROUTES = [
  "/",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/r",
  "/v",
  "/p",
] as const;

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) =>
      pathname === route ||
      (route !== "/" && pathname.startsWith(`${route}/`)),
  );
}

export default async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value ?? "";
  if (accessToken.length === 0) {
    return redirigirAlLogin(request);
  }

  if (decidirRenovacion(accessToken) !== "renovar") {
    return NextResponse.next();
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value ?? "";
  const renovada = refreshToken.length > 0 ? await renovarAccessToken(refreshToken) : null;
  if (!renovada) {
    return redirigirAlLogin(request, "expiro");
  }

  // La request actual sigue con el token nuevo (los Server Components leen
  // las cookies de la request) y la respuesta lo persiste en el navegador.
  const headers = new Headers(request.headers);
  const cookiesEntrantes = request.cookies
    .getAll()
    .filter((c) => c.name !== ACCESS_COOKIE_NAME && c.name !== REFRESH_COOKIE_NAME)
    .map((c) => `${c.name}=${c.value}`);
  cookiesEntrantes.push(`${ACCESS_COOKIE_NAME}=${renovada.accessToken}`);
  cookiesEntrantes.push(`${REFRESH_COOKIE_NAME}=${renovada.refreshToken ?? refreshToken}`);
  headers.set("cookie", cookiesEntrantes.join("; "));

  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(ACCESS_COOKIE_NAME, renovada.accessToken, cookieOptions());
  res.cookies.set(REFRESH_COOKIE_NAME, renovada.refreshToken ?? refreshToken, cookieOptions());
  return res;
}

export const config = {
  /**
   * Excluye estáticos de Next, archivos con extensión, `/api/pdf/*`,
   * `/api/cron/*`, `/api/me`, `/api/r/*`, `/api/p/*` y `/api/auth/reset`
   * (todos validan sesión / secret / slug internamente).
   *
   * `api/r/` y `api/p/` van con la barra final a propósito: sin ella el
   * prefijo también matchearía `api/resultados` / `api/presupuestos`, que sí
   * necesitan el guard de sesión.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/pdf|api/cron|api/me|api/r/|api/p/|api/auth/reset).*)",
  ],
};
