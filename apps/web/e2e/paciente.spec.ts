import { expect, test } from "@playwright/test";

import { TEST_USERS, login, uniqueCedula, uniqueName } from "./helpers";

test.describe("Pacientes (F4.1.T5)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.operador.email, TEST_USERS.operador.password);
  });

  test("crea un paciente y aparece en la lista", async ({ page }) => {
    const nombre = uniqueName("Paciente");
    const apellido = "E2E";
    const cedula = uniqueCedula();

    await page.goto("/pacientes");
    await page.getByRole("button", { name: "Nuevo paciente" }).click();

    await page.locator("#paciente-nombre").fill(nombre);
    await page.locator("#paciente-apellido").fill(apellido);
    await page.locator("#paciente-cedula").fill(cedula);
    await page.locator("#paciente-fecha").fill("1990-05-15");
    await page.locator("#paciente-sexo").selectOption("F");

    await page.getByRole("button", { name: "Crear paciente" }).click();

    await expect(
      page.locator("table").getByText(`${nombre} ${apellido}`),
    ).toBeVisible();
  });

  test("busca un paciente por cédula", async ({ page }) => {
    await page.goto("/pacientes");

    await page
      .getByPlaceholder("Buscar por nombre, apellido o cédula")
      .fill("V-12345678");

    await expect(page.getByText("María Pérez").first()).toBeVisible();
    await expect(page.getByText("V-12345678").first()).toBeVisible();
  });
});
