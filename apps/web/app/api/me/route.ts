import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  countRecentLoginFailures,
  getByEmail as getUsuarioByEmail,
  logAuthEvent,
  syncFromAuth,
  type UserRole,
} from "@labo/db/repos/usuarios";
import { getAdminDb } from "@/lib/db-server";
import { AUTH_COOKIE_NAMES, tryGetCurrentUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 5;
const SESSION_MAX_AGE_S = 8 * 60 * 60;

// ─────────────────────────────────────────────────────────────────────────────
// HTTP surface
// ─────────────────────────────────────────────────────────────────────────────

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface InsforgeLoginResponse {
  accessToken?: string;
  refreshToken?: string;
  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  user?: {
    id?: string;
    email?: string;
    name?: string;
    profile?: { name?: string };
  };
  error?: { message?: string; code?: string };
}

function readInsforgeBaseUrl(): string {
  const url = process.env.INSFORGE_URL?.trim();
  if (!url || url.length === 0) {
    throw new Error("[/api/me] INSFORGE_URL requerida para autenticación.");
  }
  return url.replace(/\/+$/, "");
}

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

function setSessionCookies(
  accessToken: string,
  refreshToken: string | undefined,
): void {
  const jar = cookies();
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  jar.set(AUTH_COOKIE_NAMES.access, accessToken, {
    ...common,
    maxAge: SESSION_MAX_AGE_S,
  });
  if (refreshToken) {
    jar.set(AUTH_COOKIE_NAMES.refresh, refreshToken, {
      ...common,
      maxAge: SESSION_MAX_AGE_S,
    });
  }
}

function clearSessionCookies(): void {
  const jar = cookies();
  jar.delete(AUTH_COOKIE_NAMES.access);
  jar.delete(AUTH_COOKIE_NAMES.refresh);
}

// GET — perfil actual
export async function GET(): Promise<Response> {
  const user = await tryGetCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  return NextResponse.json({
    id: user.userId,
    authUserId: user.authUserId,
    email: user.email,
    nombre: user.nombre,
    role: user.role,
  });
}

// POST — login
export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (email.length === 0 || password.length === 0) {
    return bad(400, "INVALID_INPUT");
  }

  const db = getAdminDb();

  // Rate limit: 5 fallos por email en 15min.
  const recentFailures = await countRecentLoginFailures(db, email, RATE_LIMIT_WINDOW_MS);
  if (recentFailures >= RATE_LIMIT_MAX_FAILURES) {
    const existing = await getUsuarioByEmail(db, email);
    await logAuthEvent(db, {
      usuarioId: existing?.id ?? null,
      action: "auth.login_blocked",
      emailIntent: email,
    });
    return bad(401, "INVALID_CREDENTIALS");
  }

  const baseUrl = readInsforgeBaseUrl();
  // Sesión InsForge Cloud: POST /api/auth/sessions con { email, password }.
  // client_type=server → tokens en body (no cookies del backend).
  const authRes = await fetch(`${baseUrl}/api/auth/sessions?client_type=server`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const payload = (await authRes.json().catch(() => ({}))) as InsforgeLoginResponse;
  const accessToken = payload.accessToken ?? payload.session?.access_token;
  const refreshToken = payload.refreshToken ?? payload.session?.refresh_token;

  if (!authRes.ok || !accessToken || !payload.user?.id) {
    const existing = await getUsuarioByEmail(db, email);
    await logAuthEvent(db, {
      usuarioId: existing?.id ?? null,
      action: "auth.login_failed",
      emailIntent: email,
      metadata: {
        insforge_status: authRes.status,
        insforge_code: payload.error?.code,
      },
    });
    return bad(401, "INVALID_CREDENTIALS");
  }

  const usuario = await syncFromAuth(db, {
    authUserId: payload.user.id,
    email: payload.user.email ?? email,
    nombre: payload.user.profile?.name ?? payload.user.name,
  });
  setSessionCookies(accessToken, refreshToken);
  await logAuthEvent(db, {
    usuarioId: usuario.id,
    action: "auth.login",
    metadata: { user_agent: request.headers.get("user-agent") ?? undefined },
  });

  return NextResponse.json({
    id: usuario.id,
    authUserId: usuario.auth_user_id,
    email: usuario.email,
    nombre: usuario.nombre,
    role: usuario.role,
  });
}

// DELETE — logout
export async function DELETE(): Promise<Response> {
  const user = await tryGetCurrentUser();
  const jar = cookies();
  const token = jar.get(AUTH_COOKIE_NAMES.access)?.value;
  if (token) {
    const baseUrl = readInsforgeBaseUrl();
    await fetch(`${baseUrl}/api/auth/sessions/current`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
  }
  clearSessionCookies();
  if (user) {
    await logAuthEvent(getAdminDb(), {
      usuarioId: user.userId,
      action: "auth.logout",
    });
  }
  return NextResponse.json({ ok: true });
}

export interface MeResponse {
  id: string;
  authUserId: string;
  email: string;
  nombre: string;
  role: UserRole;
}
