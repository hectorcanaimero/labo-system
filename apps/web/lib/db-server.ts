import "server-only";

import { cookies } from "next/headers";
import type { Sql } from "postgres";

import { closeSql, getSql } from "@labo/db/client";
import { AUTH_COOKIE_NAMES } from "@labo/lib/server/auth";

export function getDb(): Sql {
  return getSql();
}

export function getSessionAccessToken(): string | null {
  const token = cookies().get(AUTH_COOKIE_NAMES.access)?.value;
  return token && token.length > 0 ? token : null;
}

export async function closeDb(): Promise<void> {
  await closeSql();
}
