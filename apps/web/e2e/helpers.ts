import type { Page } from "@playwright/test";

/**
 * Helpers compartidos de la suite E2E (F4.1.T5).
 */

export const TEST_USERS = {
  admin: { email: "admin@labsystem.dev", password: "password123" },
  operador: { email: "operador@labsystem.dev", password: "password123" },
} as const;

/**
 * Login UI contra `POST /api/me` (flujo real, no cookie inyectada).
 * Queda en `/dashboard` al terminar.
 */
export async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

/**
 * Cédula única (8 dígitos, prefijo V-) para no colisionar entre runs ni con el
 * paciente sembrado (V-12345678).
 */
export function uniqueCedula(): string {
  return `V-${Math.floor(10000000 + Math.random() * 89999999)}`;
}

/** Nombre único para crear pacientes/entidades sin pisar fixtures previas. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Math.floor(100000 + Math.random() * 899999)}`;
}

/** Extrae el `:id` UUID de la URL actual para la ruta dada (ej. `/resultados`). */
export function idFromUrl(page: Page, segment: string): string {
  const url = page.url();
  const marker = `/${segment}/`;
  const start = url.indexOf(marker);
  if (start < 0) {
    throw new Error(`No se encontró "/${segment}/" en la URL: ${url}`);
  }
  const rest = url.slice(start + marker.length);
  return rest.split(/[?#/]/)[0] ?? "";
}
