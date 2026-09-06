import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMAIL_NO_DISPONIBLE, esEmailNoDisponible, resolveEmailProvider, sendEmail } from "./email";

/**
 * Esta clasificación es la que decide si el endpoint cae al `mailto:` o si
 * devuelve un 500. Si deja de matchear, el operador vuelve a quedarse sin
 * poder mandar el correo — por eso los mensajes de acá son los textos REALES
 * que devolvieron los proveedores, copiados tal cual.
 */
describe("esEmailNoDisponible", () => {
  it("reconoce el 401 de credencial insuficiente (anon key) en InsForge", () => {
    expect(esEmailNoDisponible("Sending emails requires an authenticated user")).toBe(true);
  });

  it("reconoce el 403 de plan sin servicio de email en InsForge", () => {
    expect(
      esEmailNoDisponible(
        "Custom email service is not available for free plan. Please upgrade to use this feature.",
      ),
    ).toBe(true);
  });

  it("reconoce dominio sin verificar y API key inválida en Resend", () => {
    expect(esEmailNoDisponible("The rvlaboratorio.com domain is not verified.")).toBe(true);
    expect(esEmailNoDisponible("API key is invalid")).toBe(true);
  });

  it("no confunde un fallo de envío real con falta de servicio", () => {
    expect(esEmailNoDisponible("Invalid recipient address")).toBe(false);
    expect(esEmailNoDisponible("SMTP connection timeout")).toBe(false);
    expect(esEmailNoDisponible("rate limit exceeded")).toBe(false);
  });
});

describe("resolveEmailProvider / sendEmail", () => {
  const ENV_KEYS = ["NODE_ENV", "EMAIL_MOCK", "RESEND_API_KEY", "EMAIL_FROM", "INSFORGE_API_KEY", "INSFORGE_URL", "NEXT_PUBLIC_INSFORGE_URL"];
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
    // vitest fija NODE_ENV=test; acá simulamos el runtime real.
    process.env.NODE_ENV = "development";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mensaje = { to: "paciente@test.com", subject: "Hola", html: "<p>Hola</p>" };

  it("prefiere Resend cuando hay RESEND_API_KEY, aunque InsForge también esté", () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.INSFORGE_API_KEY = "ik_x";
    process.env.INSFORGE_URL = "https://x.insforge.app";
    expect(resolveEmailProvider()).toBe("resend");
  });

  it("cae a InsForge sólo si no hay Resend, y a 'none' si no hay nada", () => {
    process.env.INSFORGE_API_KEY = "ik_x";
    process.env.INSFORGE_URL = "https://x.insforge.app";
    expect(resolveEmailProvider()).toBe("insforge");
    delete process.env.INSFORGE_API_KEY;
    expect(resolveEmailProvider()).toBe("none");
  });

  it("en development ya NO mockea: sin proveedor lanza EMAIL_NO_DISPONIBLE", async () => {
    await expect(sendEmail(mensaje)).rejects.toThrow(EMAIL_NO_DISPONIBLE);
  });

  it("mockea en test o con EMAIL_MOCK=true", async () => {
    process.env.EMAIL_MOCK = "true";
    process.env.RESEND_API_KEY = "re_x";
    expect(resolveEmailProvider()).toBe("mock");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail(mensaje);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envía por la API de Resend con from, to (array), subject y html", async () => {
    process.env.RESEND_API_KEY = "re_secret";
    process.env.EMAIL_FROM = "Lab <noreply@lab.test>";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(mensaje);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_secret");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Lab <noreply@lab.test>",
      to: ["paciente@test.com"],
      subject: "Hola",
      html: "<p>Hola</p>",
    });
  });

  it("clasifica 401/403 de Resend como EMAIL_NO_DISPONIBLE", async () => {
    process.env.RESEND_API_KEY = "re_bad";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 403, name: "validation_error", message: "The lab.test domain is not verified." }), { status: 403 }),
      ),
    );
    await expect(sendEmail(mensaje)).rejects.toThrow(EMAIL_NO_DISPONIBLE);
  });

  it("un fallo real de Resend NO se disfraza de EMAIL_NO_DISPONIBLE", async () => {
    process.env.RESEND_API_KEY = "re_ok";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 422, name: "validation_error", message: "Invalid `to` field." }), { status: 422 }),
      ),
    );
    await expect(sendEmail(mensaje)).rejects.toThrow(/Resend: fallo al enviar email \(422\)/);
  });
});
