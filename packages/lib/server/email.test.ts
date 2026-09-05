import { describe, expect, it } from "vitest";

import { esEmailNoDisponible } from "./email";

/**
 * Esta clasificación es la que decide si el endpoint cae al `mailto:` o si
 * devuelve un 500. Si deja de matchear, el operador vuelve a quedarse sin
 * poder mandar el correo — por eso los mensajes de acá son los textos REALES
 * que devolvió `/api/email/send-raw` en producción, copiados tal cual.
 */
describe("esEmailNoDisponible", () => {
  it("reconoce el 401 de credencial insuficiente (anon key)", () => {
    expect(esEmailNoDisponible("Sending emails requires an authenticated user")).toBe(true);
  });

  it("reconoce el 403 de plan sin servicio de email", () => {
    expect(
      esEmailNoDisponible(
        "Custom email service is not available for free plan. Please upgrade to use this feature.",
      ),
    ).toBe(true);
  });

  it("no confunde un fallo de envío real con falta de servicio", () => {
    expect(esEmailNoDisponible("Invalid recipient address")).toBe(false);
    expect(esEmailNoDisponible("SMTP connection timeout")).toBe(false);
    expect(esEmailNoDisponible("rate limit exceeded")).toBe(false);
  });
});
