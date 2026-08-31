import { cookies } from 'next/headers';
import { z } from 'zod';

import { createClient, InsForgeError } from '@insforge/sdk';
import {
  getByAuthUserId,
  syncFromAuth,
  type UserRole,
  type Usuario,
} from '@labo/db/repos/usuarios';
import { getAdminDb } from '@/lib/db-server';

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

  const db = getAdminDb();
  const displayName =
    authUser.user_metadata?.name?.trim() || authUser.name?.trim() || authUser.email;

  let usuario: Usuario | null = await getByAuthUserId(db, authUser.id);
  if (!usuario) {
    usuario = await syncFromAuth(db, {
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
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
    code: z.string().trim().min(1).max(16),
    password: z.string().min(8).max(128),
  })
  .strict();

export type PasswordResetErrorCode =
  | 'INVALID_CODE'
  | 'TOKEN_EXPIRED'
  | 'RATE_LIMITED'
  | 'RESET_FAILED';

export class PasswordResetError extends Error {
  readonly code: PasswordResetErrorCode;
  constructor(code: PasswordResetErrorCode) {
    super(code);
    this.code = code;
    this.name = 'PasswordResetError';
  }
}

function readInsforgeAnonKey(): string | null {
  const key = (process.env.INSFORGE_ANON_KEY ?? process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY)?.trim();
  return key && key.length > 0 ? key : null;
}

/** Cliente InsForge server-side para endpoints públicos de reset (anon key). */
function insforgeAuthClient() {
  return createClient({
    baseUrl: readInsforgeBaseUrl(),
    anonKey: readInsforgeAnonKey() ?? '',
  });
}

/** Mapea un error de InsForge (SDK) a un código de dominio legible por la UI. */
function mapInsforgeResetError(error: InsForgeError): PasswordResetError {
  switch (error.error) {
    case 'AUTH_TOKEN_EXPIRED':
      return new PasswordResetError('TOKEN_EXPIRED');
    case 'RATE_LIMITED':
    case 'TOO_MANY_REQUESTS':
      return new PasswordResetError('RATE_LIMITED');
    case 'INVALID_INPUT':
    case 'NOT_FOUND':
    case 'AUTH_UNAUTHORIZED':
      return new PasswordResetError('INVALID_CODE');
    default:
      return new PasswordResetError('RESET_FAILED');
  }
}

/**
 * Solicita un reset de contraseña a InsForge Auth.
 *
 * Con `resetPasswordMethod: "code"` (config del backend), InsForge envía un
 * código numérico de 6 dígitos por email (no un link). Si el email no existe
 * en auth.users, la API responde OK igual (anti-enumeración nativo). TTL y
 * single-use los gestiona InsForge (built-in).
 */
export async function requestInsforgePasswordReset(email: string): Promise<void> {
  const client = insforgeAuthClient();
  const { error } = await client.auth.sendResetPasswordEmail({ email });
  if (error) throw error;
}

/**
 * Completa el reset de contraseña con el código de 6 dígitos y la nueva
 * password (flujo de dos pasos, `resetPasswordMethod: "code"`):
 *
 *  1. `exchangeResetPasswordToken({ email, code })` → token de reset.
 *  2. `resetPassword({ newPassword, otp: token })` → actualiza la password.
 *
 * Lanza `PasswordResetError` con `code` específico (INVALID_CODE, TOKEN_EXPIRED,
 * RATE_LIMITED o RESET_FAILED) mapeado desde los códigos de InsForge.
 */
export async function completeInsforgePasswordReset(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  const client = insforgeAuthClient();

  const exchange = await client.auth.exchangeResetPasswordToken({ email, code });
  if (exchange.error) {
    throw exchange.error instanceof InsForgeError
      ? mapInsforgeResetError(exchange.error)
      : new PasswordResetError('RESET_FAILED');
  }
  const token = exchange.data?.token;
  if (!token) throw new PasswordResetError('INVALID_CODE');

  const reset = await client.auth.resetPassword({ newPassword, otp: token });
  if (reset.error) {
    throw reset.error instanceof InsForgeError
      ? mapInsforgeResetError(reset.error)
      : new PasswordResetError('RESET_FAILED');
  }
}
