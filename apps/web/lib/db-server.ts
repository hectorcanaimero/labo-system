import "server-only";

import { cookies } from "next/headers";
import { createAdminClient, createClient } from "@insforge/sdk";

import type { Db } from "@labo/db/sdk";
import { AUTH_COOKIE_NAMES } from "@/lib/server/auth";

function readBaseUrl(): string {
  const url = process.env.INSFORGE_URL?.trim();
  if (!url || url.length === 0) {
    throw new Error("[db-server] INSFORGE_URL no está definida.");
  }
  return url.replace(/\/+$/, "");
}

function readAdminApiKey(): string {
  const key = process.env.INSFORGE_API_KEY?.trim();
  if (!key || key.length === 0) {
    throw new Error("[db-server] INSFORGE_API_KEY no está definida.");
  }
  return key;
}

export function getSessionAccessToken(): string | null {
  const token = cookies().get(AUTH_COOKIE_NAMES.access)?.value;
  return token && token.length > 0 ? token : null;
}

/**
 * Cliente de datos con el JWT del usuario autenticado.
 *
 * PostgREST ve `auth.uid()` = el usuario → RLS aplica según rol. Úsalo para
 * operaciones de negocio (pacientes, presupuestos, resultados, etc.).
 */
export function getDb(): Db {
  const token = getSessionAccessToken();
  if (!token) {
    throw new Error(
      "[db-server] Sin access token: no se puede construir el cliente de datos.",
    );
  }
  return createClient({
    baseUrl: readBaseUrl(),
    accessToken: token,
  }).database;
}

/**
 * Cliente admin (bypassa RLS) para operaciones server-side pre-auth o de
 * fondo: login/audit, invitaciones, cron, migraciones, export.
 *
 * La API key vive SOLO en el servidor — nunca se expone al browser.
 */
export function getAdminDb(): Db {
  return createAdminClient({
    baseUrl: readBaseUrl(),
    apiKey: readAdminApiKey(),
  }).database;
}
