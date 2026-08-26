import { expect, test } from "@playwright/test";

import { TEST_USERS } from "./helpers";

test.describe("Password reset (F6.1.T3)", () => {
  // El mock comparte estado en memoria por email; serial evita colisiones
  // entre los dos tests que usan el mismo usuario de reset.
  test.describe.configure({ mode: "serial" });

  test("solicita código, lo ingresa y resetea la contraseña", async ({ page }) => {
    await page.goto("/forgot-password");

    await page.locator("#email").fill(TEST_USERS.reset.email);
    await page.getByRole("button", { name: "Enviar link de recuperación" }).click();

    // El flujo navega al paso de código con el email precargado en la URL.
    await page.waitForURL(/\/reset-password\?email=/);

    await page.locator("#code").fill("123456");
    await page.locator("#password").fill("nueva-clave123");
    await page.locator("#confirm").fill("nueva-clave123");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();

    await page.waitForURL(/\?reset=ok/);

    // Verifica que la nueva contraseña funciona contra el mock.
    await page.locator("#email").fill(TEST_USERS.reset.email);
    await page.locator("#password").fill("nueva-clave123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("código inválido muestra error y no resetea", async ({ page }) => {
    await page.goto("/forgot-password");

    await page.locator("#email").fill(TEST_USERS.reset.email);
    await page.getByRole("button", { name: "Enviar link de recuperación" }).click();
    await page.waitForURL(/\/reset-password\?email=/);

    await page.locator("#code").fill("000000");
    await page.locator("#password").fill("nueva-clave123");
    await page.locator("#confirm").fill("nueva-clave123");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "Código incorrecto" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password/);
  });
});
