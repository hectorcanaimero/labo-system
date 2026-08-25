import { expect, test } from "@playwright/test";

import { TEST_USERS, login } from "./helpers";

test.describe("Auth (F4.1.T5)", () => {
  test("login OK redirige al dashboard", async ({ page }) => {
    await login(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("login fallido muestra error y no redirige", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_USERS.admin.email);
    await page.locator("#password").fill("clave-incorrecta");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "Credenciales inválidas" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
