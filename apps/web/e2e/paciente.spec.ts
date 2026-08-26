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

  test("valida edad reactiva y obligatoriedad de sexo", async ({ page }) => {
    const nombre = uniqueName("Paciente");
    const cedula = uniqueCedula();

    await page.goto("/pacientes");
    await page.getByRole("button", { name: "Nuevo paciente" }).click();

    await page.locator("#paciente-nombre").fill(nombre);
    await page.locator("#paciente-apellido").fill("E2E");
    await page.locator("#paciente-cedula").fill(cedula);
    
    // Ingresamos una fecha de nacimiento pediátrica (ej: 2 años atrás)
    const hoy = new Date();
    const dosAniosAtras = new Date(hoy.getFullYear() - 2, hoy.getMonth(), hoy.getDate());
    const fechaStr = dosAniosAtras.toISOString().split("T")[0];
    await page.locator("#paciente-fecha").fill(fechaStr);

    // Verificamos que aparece el badge con "PREESCOLAR" o "LACTANTE MAYOR" etc
    await expect(page.locator("text=PREESCOLAR").or(page.locator("text=LACTANTE MAYOR"))).toBeVisible();
    
    // Tratamos de enviar sin sexo
    await page.getByRole("button", { name: "Crear paciente" }).click();
    
    // Debería mostrar error de sexo requerido
    await expect(page.getByText("El sexo biológico es requerido (M o F).")).toBeVisible();

    // Llenamos sexo y guardamos
    await page.locator("#paciente-sexo").selectOption("M");
    await page.getByRole("button", { name: "Crear paciente" }).click();
    
    await expect(page.locator("table").getByText(`${nombre} E2E`)).toBeVisible();
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
