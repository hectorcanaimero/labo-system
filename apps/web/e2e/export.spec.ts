import { expect, test } from "@playwright/test";

import { login, TEST_USERS } from "./helpers";

test.describe("Export CSV (F4.1.T5)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.operador.email, TEST_USERS.operador.password);
  });

  test("exporta presupuestos y sirve el CSV desde la URL firmada", async ({
    page,
  }) => {
    await page.goto("/presupuestos");

    // El ExportButton hace POST /api/export/presupuestos y obtiene una URL
    // firmada de descarga (mock de InsForge). Se verifica el pipeline completo:
    // endpoint 200 + url → la url firmada sirve un CSV real.
    const responsePromise = page.waitForResponse((res) =>
      res.url().includes("/api/export/presupuestos"),
    );
    await page.getByRole("button", { name: "Exportar" }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(200);

    const body = (await response.json()) as { url?: string };
    expect(body.url).toBeTruthy();
    const url = body.url as string;

    const csv = await page.request.get(url, { timeout: 30_000 });
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"] ?? "").toContain("text/csv");
    expect(await csv.text()).toContain("fecha");
  });
});
