import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getSql } from "@labo/db/client";
import {
  countRecentLoginFailures,
  getByEmail,
  logAuthEvent,
  syncFromAuth,
} from "@labo/db/repos/usuarios";
import { AUTH_COOKIE_NAMES, tryGetCurrentUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 5;
const SESSION_MAX_AGE_S = 8 * 60 * 60;

/**
 * `/api/me` es el endpoint de sesión del laboratorio (F0.2.T8).
 *
 * Contrato:
 *  - `GET`    → perfil actual `{ id, authUserId, email, nombre, role }` o 401.
 *  - `POST`   → login email+password (rate limited + audit); setea cookies
 *               httpOnly del access/refresh token de InsForge Auth.
 *  - `DELETE` → logout: revoca sesión en InsForge, limpia cookies, audit.
 *
 * Se centraliza acá para: (a) mantener el file-scope acotado del task, (b) que
 * el rate limit y el audit vivan del lado servidor (imposibles de saltar por
 * cliente), (c) evitar dos endpoints casi idénticos.
 */

// ─────────────────────────────────────────────────────────────────────────────
// GET — perfil actual
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// POST — login
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
  user?: { id?: string; email?: string; name?: string };
  error?: { message?: string; code?: string };
}

function readInsforgeBaseUrl(): string {
  const url = process.env.INSFORGE_URL?.trim();
  if (!url || url.length === 0) {
    throw new Error(
      "[/api/me] INSFORGE_URL no está definida. Requerida para autenticación.",
    );
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

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (email.length === 0 || password.length === 0) {
    return bad(400, "INVALID_INPUT");
  }

  const sql = getSql();

  // Rate limit lógico: 5 fallos por email en 15min (spec F0.2.T8).
  const recentFailures = await countRecentLoginFailures(
    sql,
    email,
    RATE_LIMIT_WINDOW_MS,
  );
  if (recentFailures >= RATE_LIMIT_MAX_FAILURES) {
    const existing = await getByEmail(sql, email);
    await logAuthEvent(sql, {
      usuarioId: existing?.id ?? null,
      action: "auth.login_blocked",
      emailIntent: email,
    });
    // Mensaje genérico — no revelar bloqueo específico.
    return bad(401, "INVALID_CREDENTIALS");
  }

  const baseUrl = readInsforgeBaseUrl();
  // Contract real InsForge: POST /api/auth/sessions con { method: "password" }.
  // client_type=server → accessToken/refreshToken en el body (no cookie propia).
  const authRes = await fetch(`${baseUrl}/api/auth/sessions?client_type=server`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ method: "password", email, password }),
    cache: "no-store",
  });

  const payload = (await authRes.json().catch(() => ({}))) as InsforgeLoginResponse;
  const accessToken = payload.accessToken ?? payload.session?.access_token;
  const refreshToken = payload.refreshToken ?? payload.session?.refresh_token;

  if (!authRes.ok || !accessToken || !payload.user?.id) {
    const existing = await getByEmail(sql, email);
    await logAuthEvent(sql, {
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

  // Sync perfil de dominio y setea cookies de sesión.
  const usuario = await syncFromAuth(sql, {
    authUserId: payload.user.id,
    email: payload.user.email ?? email,
    nombre: payload.user.name,
  });
  setSessionCookies(accessToken, refreshToken);
  await logAuthEvent(sql, {
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

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — logout
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(): Promise<Response> {
  const user = await tryGetCurrentUser();
  const jar = cookies();
  const token = jar.get(AUTH_COOKIE_NAMES.access)?.value;
  if (token) {
    const baseUrl = readInsforgeBaseUrl();
    // Best-effort revoke en InsForge; el clear de cookies local es la fuente
    // real de "no autenticado" para el resto del stack.
    await fetch(`${baseUrl}/api/auth/sessions/current`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
  }
  clearSessionCookies();
  if (user) {
    const sql = getSql();
    await logAuthEvent(sql, {
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
  role: "admin" | "operador";
}
