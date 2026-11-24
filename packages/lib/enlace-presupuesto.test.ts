import { describe, expect, it } from "vitest";

import {
  asuntoEmail,
  enlaceWhatsApp,
  htmlEmail,
  mailtoPresupuesto,
  mensajeWhatsApp,
  type MensajePresupuestoInput,
} from "./enlace-presupuesto";

// Los normalizadores de teléfono/email y `generarSlug` son los mismos de
// enlace-resultado.ts (F7.2.T7 los reusa, no los duplica) — ya están
// probados en enlace-resultado.test.ts, no hace falta repetirlo acá.

describe("mensajes", () => {
  const input: MensajePresupuestoInput = {
    paciente: "María",
    laboratorio: "Lab RV",
    numero: "PR-2026-000127",
    url: "https://labo.test/p/aB3xY9kQ2m",
    vence: "4 de octubre de 2026",
    examenes: ["Hemograma completo", "Urea"],
    totalUsd: 46.18,
  };

  it("el texto de WhatsApp es el del laboratorio: exámenes por nombre, servicios, total y enlace", () => {
    expect(mensajeWhatsApp(input)).toBe(
      "¡Listo!. 👋✨\n\n" +
        "Por esta vía le hacemos llegar el presupuesto detallado para sus exámenes de laboratorio 📄🔬:\n\n" +
        "El presupuesto incluye: Hemograma completo, Urea, Toma de Muestra y Servicio 100% a Domicilio.\n\n" +
        "💳 Total General: $46.18 (o Bs. a la tasa oficial del BCV del día).\n\n" +
        "Detalle del presupuesto: https://labo.test/p/aB3xY9kQ2m",
    );
  });

  it("el link wa.me codifica el mensaje", () => {
    const link = enlaceWhatsApp("584141234567", mensajeWhatsApp(input));
    expect(link.startsWith("https://wa.me/584141234567?text=")).toBe(true);
    expect(link).not.toContain(" ");
  });

  it("el asunto del email lleva el número de presupuesto", () => {
    expect(asuntoEmail("Lab RV", "PR-2026-000127")).toBe("Presupuesto PR-2026-000127 — Lab RV");
  });

  it("el mailto lleva destinatario, asunto y cuerpo, sin '+' por espacios", () => {
    const link = mailtoPresupuesto("paciente@test.com", input);
    expect(link.startsWith("mailto:paciente%40test.com?")).toBe(true);
    expect(link).toContain("subject=");
    expect(link).toContain("body=");
    // RFC 6068: el espacio va como %20, no como "+"
    expect(link).not.toContain("+");
    expect(decodeURIComponent(link)).toContain(input.url);
  });

  it("el html escapa el nombre del paciente y el número", () => {
    const html = htmlEmail({ ...input, paciente: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("PR-2026-000127");
  });

  it("el html no incluye monto ni tasa", () => {
    const html = htmlEmail(input);
    expect(html).not.toContain("16.50");
    expect(html).not.toContain("990,00");
    expect(html).not.toContain("tasa");
  });
});
