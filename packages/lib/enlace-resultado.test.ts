import { describe, expect, it } from "vitest";

import {
  SLUG_PATTERN,
  enlaceWhatsApp,
  generarSlug,
  htmlEmail,
  mensajeWhatsApp,
  mailtoResultado,
  normalizarTelefonoWhatsApp,
} from "./enlace-resultado";

describe("generarSlug", () => {
  it("genera 10 chars base62", () => {
    expect(generarSlug()).toMatch(SLUG_PATTERN);
  });

  it("no repite en 1000 tiradas", () => {
    const vistos = new Set(Array.from({ length: 1000 }, () => generarSlug()));
    expect(vistos.size).toBe(1000);
  });

  it("respeta el largo pedido", () => {
    expect(generarSlug(24)).toHaveLength(24);
  });
});

describe("normalizarTelefonoWhatsApp", () => {
  it("nacional con 0 y separadores → 58 + 10 dígitos", () => {
    expect(normalizarTelefonoWhatsApp("0414-1234567")).toBe("584141234567");
  });

  it("internacional con + y espacios", () => {
    expect(normalizarTelefonoWhatsApp("+58 412 1234567")).toBe("584121234567");
  });

  it("nacional sin 0", () => {
    expect(normalizarTelefonoWhatsApp("4141234567")).toBe("584141234567");
  });

  it("deja pasar otro código de país", () => {
    expect(normalizarTelefonoWhatsApp("+54 9 11 5555 4444")).toBe("5491155554444");
  });

  it("null / vacío / basura → null", () => {
    expect(normalizarTelefonoWhatsApp(null)).toBeNull();
    expect(normalizarTelefonoWhatsApp("")).toBeNull();
    expect(normalizarTelefonoWhatsApp("sin teléfono")).toBeNull();
    expect(normalizarTelefonoWhatsApp("123")).toBeNull();
  });
});

describe("mensajes", () => {
  const input = {
    paciente: "María",
    laboratorio: "Lab RV",
    url: "https://labo.test/r/aB3xY9kQ2m",
    vence: "4 de octubre de 2026",
  };

  it("el texto de WhatsApp incluye paciente, laboratorio, url y vigencia", () => {
    const texto = mensajeWhatsApp(input);
    expect(texto).toContain("María");
    expect(texto).toContain("Lab RV");
    expect(texto).toContain(input.url);
    expect(texto).toContain("4 de octubre de 2026");
    expect(texto).not.toContain("undefined");
  });

  it("el link wa.me codifica el mensaje", () => {
    const link = enlaceWhatsApp("584141234567", mensajeWhatsApp(input));
    expect(link.startsWith("https://wa.me/584141234567?text=")).toBe(true);
    expect(link).not.toContain(" ");
  });

  it("el mailto lleva destinatario, asunto y cuerpo, sin '+' por espacios", () => {
    const link = mailtoResultado("paciente@test.com", input);
    expect(link.startsWith("mailto:paciente%40test.com?")).toBe(true);
    expect(link).toContain("subject=");
    expect(link).toContain("body=");
    // RFC 6068: el espacio va como %20, no como "+"
    expect(link).not.toContain("+");
    expect(decodeURIComponent(link)).toContain(input.url);
  });

  it("el html escapa el nombre del paciente", () => {
    const html = htmlEmail({ ...input, paciente: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
