import { cookies } from 'next/headers';
import { z } from 'zod';

import { getSql } from '@labo/db/client';
import {
  getByAuthUserId,
  syncFromAuth,
  type UserRole,
  type Usuario,
} from '@labo/db/repos/usuarios';

/**
 * Auth server helpers (ADR-11, F0.2.T8).
 *
 * InsForge Auth expone JWT: access token en cookie legible + refresh token en
 * cookie httpOnly. Este módulo lee la sesión desde el access token de la
 * request, la valida contra el endpoint `/api/auth/sessions/current` de
 * InsForge, y resuelve el rol de dominio contra la tabla `usuarios`.
 *
 * Uso típico en Server Components y Route Handlers:
 *
 *   const user = await getCurrentUser();
 *   await requireRole("admin");
 */

const DEFAULT_ACCESS_COOKIE = 'insforge-access-token';
const DEFAULT_REFRESH_COOKIE = 'insforge-refresh-token';

export const AUTH_COOKIE_NAMES = {
  access: process.env.INSFORGE_ACCESS_COOKIE ?? DEFAULT_ACCESS_COOKIE,
  refresh: process.env.INSFORGE_REFRESH_COOKIE ?? DEFAULT_REFRESH_COOKIE,
} as const;

export type AuthErrorCode = 'UNAUTHENTICATED' | 'UNAUTHORIZED';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'AuthError';
  }
}

export interface CurrentUser {
  userId: string;
  email: string;
  role: UserRole;
  nombre: string;
  authUserId: string;
}

interface InsforgeSessionResponse {
  user?: { id?: string; email?: string; name?: string; user_metadata?: { name?: string } };
  session?: { access_token?: string; expires_at?: number };
}

function readInsforgeBaseUrl(): string {
  const url = process.env.INSFORGE_URL?.trim();
  if (!url || url.length === 0) {
    throw new Error(
      '[@labo/web/lib/server/auth] INSFORGE_URL no está definida. ' +
        'Es requerida para validar sesiones server-side contra InsForge Auth.'
    );
  }
  return url.replace(/\/+$/, '');
}

function readAccessTokenFromCookies(): string | null {
  const jar = cookies();
  const token = jar.get(AUTH_COOKIE_NAMES.access)?.value;
  return token && token.length > 0 ? token : null;
}

/**
 * Verifica el access token contra InsForge y devuelve la fila `auth.users`
 * asociada, o `null` si el token es inválido/expirado.
 *
 * Se llama vía fetch (no SDK) porque este módulo corre server-side y no
 * requiere carga adicional del cliente JS.
 */
async function fetchInsforgeUser(
  accessToken: string
): Promise<InsforgeSessionResponse['user'] | null> {
  const baseUrl = readInsforgeBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/sessions/current`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(
      `[@labo/web/lib/server/auth] InsForge Auth respondió ${res.status} al validar sesión.`
    );
  }
  const payload = (await res.json()) as InsforgeSessionResponse;
  return payload.user ?? null;
}

/**
 * Retorna el usuario autenticado (auth + rol) o lanza `AuthError`.
 *
 * Pasos:
 *  1. Lee el access token de cookies.
 *  2. Lo valida contra InsForge Auth.
 *  3. Sincroniza fila en `usuarios` (crea con role default `operador` si
 *     todavía no existe — cubre el primer login sin invitación previa).
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const token = readAccessTokenFromCookies();
  if (!token) throw new AuthError('UNAUTHENTICATED');

  const authUser = await fetchInsforgeUser(token);
  if (!authUser?.id || !authUser.email) throw new AuthError('UNAUTHENTICATED');

  const sql = getSql();
  const displayName =
    authUser.user_metadata?.name?.trim() || authUser.name?.trim() || authUser.email;

  let usuario: Usuario | null = await getByAuthUserId(sql, authUser.id);
  if (!usuario) {
    usuario = await syncFromAuth(sql, {
      authUserId: authUser.id,
      email: authUser.email,
      nombre: displayName,
    });
  }

  if (!usuario.activo) throw new AuthError('UNAUTHORIZED');

  return {
    userId: usuario.id,
    email: usuario.email,
    role: usuario.role,
    nombre: usuario.nombre,
    authUserId: authUser.id,
  };
}

/**
 * Retorna el usuario si está autenticado o `null`. No lanza.
 * Útil para redirecciones opcionales (p.ej. `/login` cuando ya hay sesión).
 */
export async function tryGetCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (err) {
    if (err instanceof AuthError) return null;
    throw err;
  }
}

/**
 * Guard fine-grained. Falla con `AuthError('UNAUTHORIZED')` si el rol no
 * matchea. Complementa el guard coarse-grained del middleware (ARCH §7.2).
 */
export async function requireRole(role: UserRole): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user.role !== role) throw new AuthError('UNAUTHORIZED');
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Password reset — F0.2.T6
// ─────────────────────────────────────────────────────────────────────────────

export const PasswordRecoveryRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
  })
  .strict();

export const PasswordRecoveryConfirmationSchema = z
  .object({
    token: z.string().trim().min(1).max(4_096),
    password: z.string().min(8).max(128),
  })
  .strict();

export type PasswordResetErrorCode =
  'TOKEN_EXPIRED' | 'TOKEN_USED' | 'TOKEN_INVALID' | 'RESET_FAILED';

export class PasswordResetError extends Error {
  readonly code: PasswordResetErrorCode;
  constructor(code: PasswordResetErrorCode) {
    super(code);
    this.code = code;
    this.name = 'PasswordResetError';
  }
}

interface InsforgeResetResponse {
  error?: { message?: string; code?: string } | string;
  code?: string;
  message?: string;
}

function readInsforgeAnonKey(): string | null {
  const key = (process.env.INSFORGE_ANON_KEY ?? process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY)?.trim();
  return key && key.length > 0 ? key : null;
}

function passwordResetHeaders(): Record<string, string> {
  const anonKey = readInsforgeAnonKey();
  return {
    'content-type': 'application/json',
    Accept: 'application/json',
    ...(anonKey
      ? {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        }
      : {}),
  };
}

function normalizePasswordResetError(
  payload: InsforgeResetResponse,
  status: number
): PasswordResetErrorCode {
  const providerCode =
    typeof payload.error === 'object'
      ? (payload.error?.code ?? payload.error?.message)
      : (payload.error ?? payload.code ?? payload.message);
  const normalized = (providerCode ?? '').toLowerCase();

  if (status === 410 || normalized.includes('expir')) return 'TOKEN_EXPIRED';
  if (
    normalized.includes('used') ||
    normalized.includes('reuse') ||
    normalized.includes('consum')
  ) {
    return 'TOKEN_USED';
  }
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    normalized.includes('invalid') ||
    normalized.includes('token') ||
    normalized.includes('otp')
  ) {
    return 'TOKEN_INVALID';
  }
  return 'RESET_FAILED';
}

/**
 * Solicita un reset de contraseña a InsForge Auth.
 *
 * InsForge envía el email con el link de reset. Si el email no existe en
 * auth.users, la API responde OK igual (anti-enumeración nativo). TTL y
 * single-use son responsabilidad de InsForge (built-in).
 *
 * `redirectTo` debe ser la URL absoluta de la página `/reset-password` de la
 * app; InsForge le agrega `?token=XXXX` antes de enviarlo en el email.
 */
export async function requestInsforgePasswordReset(
  email: string,
  redirectTo: string
): Promise<void> {
  const baseUrl = readInsforgeBaseUrl();
  let res = await fetch(`${baseUrl}/api/auth/email/send-reset-password`, {
    method: 'POST',
    headers: passwordResetHeaders(),
    body: JSON.stringify({ email, redirectTo }),
    cache: 'no-store',
  });
  // Compatibilidad con despliegues InsForge que todavía exponen el contrato
  // recovery/verify anterior. El mock E2E implementa ambos contratos.
  if (res.status === 404) {
    res = await fetch(`${baseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: passwordResetHeaders(),
      body: JSON.stringify({ email, redirect_to: redirectTo }),
      cache: 'no-store',
    });
  }
  // 204 = no content (aceptado); 200 = OK con body. Ambos son éxito.
  // 404 = email no existe — InsForge puede retornar esto; tratarlo como éxito
  // para no revelar existencia del usuario.
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new Error(
      `[@labo/web/lib/server/auth] InsForge password reset request failed: ${res.status}`
    );
  }
}

/**
 * Completa el reset de contraseña con el token del email y la nueva password.
 *
 * Lanza `PasswordResetError` con `code` específico cuando el token es inválido,
 * expirado o ya usado (InsForge retorna estos errores nativamente).
 */
export async function completeInsforgePasswordReset(
  token: string,
  newPassword: string
): Promise<void> {
  const baseUrl = readInsforgeBaseUrl();
  let res = await fetch(`${baseUrl}/api/auth/email/reset-password`, {
    method: 'POST',
    headers: passwordResetHeaders(),
    body: JSON.stringify({ otp: token, newPassword }),
    cache: 'no-store',
  });
  if (res.status === 404) {
    res = await fetch(`${baseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: passwordResetHeaders(),
      body: JSON.stringify({ type: 'recovery', token, password: newPassword }),
      cache: 'no-store',
    });
  }
  if (res.ok || res.status === 204) return;

  const payload = (await res.json().catch(() => ({}))) as InsforgeResetResponse;
  throw new PasswordResetError(normalizePasswordResetError(payload, res.status));
}
