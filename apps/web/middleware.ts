import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { makeFunctionReference } from "convex/server";

/**
 * Rutas públicas (flujos de auth): no requieren sesión.
 *
 * Incluye las rutas planificadas en F0.auth.T06 (`/forgot-password`,
 * `/reset-password`) y F0.auth.T07 (`/accept-invite`) para que el guard
 * coarse-grained no las bloquee cuando se implementen.
 */
const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
] as const;

/**
 * Rutas Admin-only (ARCH §7.2). Guard coarse-grained del middleware;
 * el guard fine-grained lo hace `requireRole` en cada mutation (F0.auth.T04).
 */
const ADMIN_ROUTE_PREFIXES = ["/config", "/examenes"] as const;

const NO_PERMISSION_REASON = "sin-permisos";

/**
 * Referencia server-side a `usuarios.me` (F0.auth.T04) por path, sin depender
 * del `api` generado. Mismo patrón que `app/api/pdf/route.ts`.
 */
const usuariosMe = makeFunctionReference<
  "query",
  Record<string, never>,
  { role: string } | null
>("usuarios.me");

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Lee el rol del usuario actual desde la tabla `usuarios` vía `fetchQuery`
 * server-side, en lugar de embeberlo como claim en el JWT.
 *
 * Razones (spec F0.auth.T03 "definir en implementación cuál es más limpio"):
 * - Fuente única de verdad: la tabla `usuarios`. Sin drift entre token y DB.
 * - Rol siempre fresco: un cambio de rol aplica al instante, sin esperar
 *   refresh del token.
 * - Reutiliza `usuarios.me` (F0.auth.T04) — no toca `auth.ts`.
 * - Costo despreciable: una query sólo en rutas admin (bajo tráfico).
 */
async function getCurrentRole(
  getToken: () => Promise<string | undefined>
): Promise<"admin" | "operador" | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const user = await fetchQuery(usuariosMe, {}, { token });
    const role = user?.role;
    if (role === "admin" || role === "operador") return role;
    return null;
  } catch {
    return null;
  }
}

export default convexAuthNextjsMiddleware(async (request, ctx) => {
  const { pathname } = request.nextUrl;
  const { convexAuth } = ctx;

  if (pathname === "/login") {
    if (await convexAuth.isAuthenticated()) {
      return nextjsMiddlewareRedirect(request, "/dashboard");
    }
    return;
  }

  if (isPublicRoute(pathname)) {
    return;
  }

  if (!(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/login");
  }

  if (isAdminRoute(pathname)) {
    const role = await getCurrentRole(convexAuth.getToken);
    if (role !== "admin") {
      return nextjsMiddlewareRedirect(
        request,
        `/dashboard?reason=${NO_PERMISSION_REASON}`
      );
    }
  }

  return;
});

export const config = {
  /**
   * Excluye estáticos de Next, archivos con extensión y `/api/pdf/*`
   * (valida sesión internamente via cookie). Incluye `/api/auth/*`
   * para que el middleware proxyee signIn/signOut a Convex.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/pdf).*)",
  ],
};
