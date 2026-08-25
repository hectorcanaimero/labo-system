import { expect, test } from "@playwright/test";

import { idFromUrl, login, TEST_USERS } from "./helpers";

test.describe("Resultados (F4.1.T5)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.operador.email, TEST_USERS.operador.password);
  });

  test("crea un resultado y descarga su PDF", async ({ page }) => {
    await page.goto("/resultados/nuevo");

    // 1. Seleccionar paciente (fixture sembrado).
    await page
      .getByPlaceholder("Buscar por nombre, apellido o cédula")
      .fill("María");
    await page.locator('[role="option"]').first().click();
    await expect(page.getByText("Seleccionado: María Pérez")).toBeVisible();

    // 2. Fecha de muestra (pasada, válida).
    await page.getByLabel(/Fecha de muestra/).fill("2024-05-10");

    // 3. Agregar examen del catálogo y cargar valor.
    await page.getByPlaceholder("Buscá por nombre del examen").fill("Hemograma");
    await page.getByRole("button", { name: /Hemograma Completo/ }).click();
    await page.getByPlaceholder("Ej: 5.4").fill("5.0");

    // 4. Guardar → redirige a la ficha del resultado.
    await page.getByRole("button", { name: "Guardar resultado" }).click();
    await page.waitForURL(/\/resultados\/[0-9a-f-]{36}/);

    const resultadoId = idFromUrl(page, "resultados");

    // 5. Descargar PDF: el botón debe estar presente y operativo. El endpoint
    //    se verifica por GET directo porque en headless Chromium el visor PDF
    //    nativo no está disponible y el popup descargaría el binario en vez de
    //    navegar, lo que hace frágil el assert sobre la URL del popup.
    await expect(
      page.getByRole("button", { name: "Descargar PDF" }),
    ).toBeVisible();

    // 6. Verificar que el endpoint sirve un PDF real (200 + content-type).
    const origin = new URL(page.url()).origin;
    const pdf = await page.request.get(`${origin}/api/pdf/resultado/${resultadoId}`, {
      timeout: 60_000,
    });
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"] ?? "").toContain("application/pdf");
    expect((await pdf.body()).length).toBeGreaterThan(0);
  });
});
