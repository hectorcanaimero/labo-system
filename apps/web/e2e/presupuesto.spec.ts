import { expect, test } from "@playwright/test";

import { login, TEST_USERS } from "./helpers";

test.describe("Presupuestos (F4.1.T5)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.operador.email, TEST_USERS.operador.password);
  });

  test("crea un presupuesto, lo aprueba y lo convierte a resultado", async ({
    page,
  }) => {
    // 1. Crear presupuesto.
    await page.goto("/presupuestos/nuevo");

    // Paciente registrado (fixture sembrado).
    await page
      .getByPlaceholder("Buscar por nombre, apellido o cédula")
      .fill("María");
    await page.locator('[role="option"]').first().click();
    await expect(page.getByText("María Pérez")).toBeVisible();

    // Agregar un examen.
    await page.getByPlaceholder("Buscá por nombre del examen").fill("Hemograma");
    await page.getByRole("button", { name: /Hemograma Completo/ }).click();

    // Tasa Bs válida (input único con step 0.0001).
    await page.locator('input[step="0.0001"]').fill("36.5");

    await page.getByRole("button", { name: "Guardar presupuesto" }).click();
    await page.waitForURL(/\/presupuestos\/[0-9a-f-]{36}/);

    // 2. Aprobar.
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(
      page.getByRole("button", { name: "Convertir a Resultado" }),
    ).toBeVisible();

    // 3. Convertir a resultado (modal de confirmación).
    await page.getByRole("button", { name: "Convertir a Resultado" }).click();
    await page.getByRole("button", { name: "Confirmar conversión" }).click();

    await page.waitForURL(/\/resultados\/[0-9a-f-]{36}/);
  });
});
