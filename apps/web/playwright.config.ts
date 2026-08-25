import { defineConfig, devices } from "@playwright/test";

/**
 * Suite E2E Playwright (F4.1.T5).
 *
 * Flujos críticos: login, crear/buscar paciente, crear resultado + PDF,
 * crear/aprobar/convertir presupuesto y exportar CSV de presupuestos.
 *
 * Arquitectura hermética:
 *  - `e2e/server/mock-insforge.cjs` emula InsForge Auth + Storage (sin backend
 *    real) para que la suite corra local y en CI sin infraestructura externa.
 *  - `e2e/global-setup.ts` aplica el schema de `@labo/db` y siembra fixtures
 *    deterministas (usuarios, catálogo, paciente, tasa, presupuesto) en el
 *    Postgres apuntado por `DATABASE_URL`.
 *
 * Requisitos previos:
 *  - `DATABASE_URL` apuntando a un Postgres disponible (local o servicio CI).
 */

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 7330);

const baseURL = `http://localhost:${APP_PORT}`;
const mockUrl = `http://localhost:${MOCK_PORT}`;

// Entorno inyectado al proceso `next dev`. Las variables reales del shell
// tienen precedencia sobre los `.env*` de Next, así que estos valores mandan.
const appEnv: Record<string, string> = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  INSFORGE_URL: mockUrl,
  INSFORGE_ANON_KEY: "e2e-anon-key",
  NEXT_PUBLIC_INSFORGE_URL: mockUrl,
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "e2e-anon-key",
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",

  // Un solo worker: los tests comparten Postgres y corren en orden para que los
  // datos sean deterministas y el tiempo total se mantenga < 5min.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  webServer: [
    {
      command: "node e2e/server/mock-insforge.cjs",
      url: `${mockUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `pnpm exec next dev -p ${APP_PORT}`,
      url: `${baseURL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: appEnv,
    },
  ],

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
