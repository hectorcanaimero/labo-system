import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fechaInputLab,
  formatFechaHoraLab,
  formatFechaLab,
  hoyLabInput,
  LAB_TIMEZONE,
  limitesDiaLabUTC,
} from "./fecha";

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

describe("fechaInputLab", () => {
  it("formatea yyyy-mm-dd en la zona del laboratorio, no en UTC", () => {
    // 01:30 UTC del 7 son las 21:30 del 6 en Caracas: cambia el día.
    expect(fechaInputLab("2026-09-07T01:30:00.000Z")).toBe("2026-09-06");
    expect(fechaInputLab("2026-09-07T04:00:00.000Z")).toBe("2026-09-07");
  });

  it("tolera null e inválido devolviendo string vacío", () => {
    expect(fechaInputLab(null)).toBe("");
    expect(fechaInputLab(undefined)).toBe("");
    expect(fechaInputLab("no es fecha")).toBe("");
  });
});

describe("hoyLabInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a las 21:00 de Caracas todavía propone el día de hoy en Caracas", () => {
    // 21:00 Caracas del 16/09 = 01:00 UTC del 17/09: en UTC ya es "mañana".
    vi.setSystemTime(new Date("2026-09-17T01:00:00.000Z"));
    expect(hoyLabInput()).toBe("2026-09-16");
  });

  it("después de medianoche en Caracas ya propone el día siguiente", () => {
    // 00:30 Caracas del 17/09 = 04:30 UTC del 17/09.
    vi.setSystemTime(new Date("2026-09-17T04:30:00.000Z"));
    expect(hoyLabInput()).toBe("2026-09-17");
  });
});

describe("limitesDiaLabUTC", () => {
  it("da los límites UTC de un día de Caracas, con hasta exclusivo", () => {
    const { desde, hasta } = limitesDiaLabUTC("2026-09-16");
    expect(desde.toISOString()).toBe("2026-09-16T04:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-09-17T04:00:00.000Z");
  });

  it("incluye una muestra tomada a las 22:00 de Caracas del mismo día", () => {
    const { desde, hasta } = limitesDiaLabUTC("2026-09-16");
    // 22:00 Caracas del 16/09 = 02:00 UTC del 17/09.
    const muestra = new Date("2026-09-17T02:00:00.000Z");
    expect(muestra >= desde && muestra < hasta).toBe(true);
  });
});
