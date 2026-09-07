import { describe, expect, it } from "vitest";

import { formatFechaHoraLab, formatFechaLab, LAB_TIMEZONE } from "./fecha";

describe("LAB_TIMEZONE", () => {
  it("es la zona de Venezuela", () => {
    expect(LAB_TIMEZONE).toBe("America/Caracas");
  });
});

describe("formatFechaLab", () => {
  it("formatea dd/mm/aaaa en la zona del laboratorio, no en UTC", () => {
    // 01:30 UTC del 7 son las 21:30 del 6 en Caracas: cambia el día.
    expect(formatFechaLab("2026-09-07T01:30:00.000Z")).toBe("06/09/2026");
    expect(formatFechaLab("2026-09-07T04:00:00.000Z")).toBe("07/09/2026");
  });

  it("tolera null e inválido", () => {
    expect(formatFechaLab(null)).toBe("—");
    expect(formatFechaLab(undefined)).toBe("—");
    expect(formatFechaLab("no es fecha")).toBe("—");
  });
});

describe("formatFechaHoraLab", () => {
  it("convierte a America/Caracas (UTC-4)", () => {
    expect(formatFechaHoraLab("2026-09-07T01:30:00.000Z")).toBe("06/09/2026 21:30");
    expect(formatFechaHoraLab("2026-09-07T03:59:00.000Z")).toBe("06/09/2026 23:59");
    expect(formatFechaHoraLab("2026-09-07T04:00:00.000Z")).toBe("07/09/2026 00:00");
  });

  it("usa reloj de 24 horas y medianoche como 00:00", () => {
    expect(formatFechaHoraLab("2026-09-07T20:05:00.000Z")).toBe("07/09/2026 16:05");
    expect(formatFechaHoraLab(new Date(Date.UTC(2026, 8, 7, 4, 0)))).toBe("07/09/2026 00:00");
  });

  it("la fecha corta y la larga coinciden en el día", () => {
    const valor = "2026-09-07T02:00:00.000Z";
    expect(formatFechaHoraLab(valor).startsWith(formatFechaLab(valor))).toBe(true);
  });

  it("tolera null e inválido", () => {
    expect(formatFechaHoraLab(null)).toBe("—");
    expect(formatFechaHoraLab(undefined)).toBe("—");
    expect(formatFechaHoraLab("no es fecha")).toBe("—");
  });
});
