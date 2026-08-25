import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware Next.js (F0.2.T8 — ADR-11).
 *
 * - Auth guard sobre el grupo `(app)` (redirect a `/login` sin sesión).
 * - Redirige `/login` → `/dashboard` si ya hay sesión.
 * - Guard de rol Admin sobre `/config/*`, `/examenes/*` y `/audit/*`.
 * - Excluye del matcher `/api/pdf/*` y `/api/cron/*` (validan internamente).
 *
 * Lee la cookie `insforge-access-token` (nombre configurable por env) y para
 * las rutas admin consulta `/api/me` (nodejs runtime) que resuelve rol
 * server-side contra la tabla `usuarios`. Elegimos consultar `/api/me` en vez
 * de decodificar JWT en Edge para mantener una sola fuente de verdad del rol.
 */

const ACCESS_COOKIE_NAME =
  process.env.INSFORGE_ACCESS_COOKIE ?? "insforge-access-token";

const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
] as const;

const ADMIN_ROUTE_PREFIXES = ["/config", "/examenes", "/audit"] as const;

const NO_PERMISSION_REASON = "sin-permisos";

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function redirect(request: NextRequest, dest: string): NextResponse {
  const url = request.nextUrl.clone();
  const [pathname, search = ""] = dest.split("?");
  url.pathname = pathname ?? "/";
  url.search = search ? `?${search}` : "";
  return NextResponse.redirect(url);
}

/**
 * Consulta el rol al Route Handler `/api/me` reenviando la cookie de sesión.
 * Devuelve `null` si la sesión es inválida o el usuario no está sincronizado.
 */
async function fetchRoleFromApi(
  request: NextRequest,
): Promise<"admin" | "operador" | null> {
  const meUrl = new URL("/api/me", request.nextUrl.origin);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const res = await fetch(meUrl, {
    method: "GET",
    headers: {
      cookie: cookieHeader,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { role?: string } | null;
  const role = body?.role;
  return role === "admin" || role === "operador" ? role : null;
}

export default async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const hasSessionCookie =
    (request.cookies.get(ACCESS_COOKIE_NAME)?.value?.length ?? 0) > 0;

  if (pathname === "/login") {
    if (hasSessionCookie) {
      // Confirmar contra `/api/me` (la cookie podría estar expirada) para no
      // redirigir en loop si la sesión ya no es válida.
      const role = await fetchRoleFromApi(request);
      if (role) return redirect(request, "/dashboard");
    }
    return NextResponse.next();
  }

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie) {
    return redirect(request, "/login");
  }

  if (isAdminRoute(pathname)) {
    const role = await fetchRoleFromApi(request);
    if (!role) return redirect(request, "/login");
    if (role !== "admin") {
      return redirect(request, `/dashboard?reason=${NO_PERMISSION_REASON}`);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Excluye estáticos de Next, archivos con extensión, `/api/pdf/*`,
   * `/api/cron/*`, `/api/me` y `/api/auth/reset` (todos validan sesión /
   * secret internamente, no pasan por este middleware). `/api/auth/reset` se
   * excluye porque es accesible sin sesión (flujo de recuperación de
   * contraseña — F0.2.T6).
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/pdf|api/cron|api/me|api/auth/reset).*)",
  ],
};
