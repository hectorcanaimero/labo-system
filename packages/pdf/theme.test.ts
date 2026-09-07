import { describe, expect, it } from "vitest";

import { assetOrNull, formatDateDMY, formatDateTimeDMY } from "./theme";

describe("assetOrNull", () => {
  it("descarta null, vacío y el PNG transparente de fallback", () => {
    expect(assetOrNull(null)).toBeNull();
    expect(assetOrNull("")).toBeNull();
    expect(
      assetOrNull(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
    ).toBeNull();
  });

  it("deja pasar un asset real", () => {
    expect(assetOrNull("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
});

describe("formatDateDMY", () => {
  it("formatea dd/mm/aaaa en UTC y tolera null/inválido", () => {
    expect(formatDateDMY("2026-08-31T00:00:00.000Z")).toBe("31/08/2026");
    expect(formatDateDMY(new Date(Date.UTC(2026, 0, 5)))).toBe("05/01/2026");
    expect(formatDateDMY(null)).toBe("—");
    expect(formatDateDMY("no es fecha")).toBe("—");
  });
});

describe("formatDateTimeDMY", () => {
  it("convierte a America/Caracas (UTC-4), no a UTC", () => {
    // 01:30 UTC del 7 son las 21:30 del 6 en Caracas: el día también cambia.
    expect(formatDateTimeDMY("2026-09-07T01:30:00.000Z")).toBe("06/09/2026 21:30");
    expect(formatDateTimeDMY("2026-09-07T03:59:00.000Z")).toBe("06/09/2026 23:59");
    expect(formatDateTimeDMY("2026-09-07T04:00:00.000Z")).toBe("07/09/2026 00:00");
  });

  it("usa reloj de 24 horas y medianoche como 00:00", () => {
    expect(formatDateTimeDMY("2026-09-07T20:05:00.000Z")).toBe("07/09/2026 16:05");
    expect(formatDateTimeDMY(new Date(Date.UTC(2026, 8, 7, 4, 0)))).toBe("07/09/2026 00:00");
  });

  it("difiere de formatDateDMY cuando la hora local cae en el día anterior", () => {
    const nocheEnCaracas = "2026-09-07T02:00:00.000Z";
    expect(formatDateDMY(nocheEnCaracas)).toBe("07/09/2026");
    expect(formatDateTimeDMY(nocheEnCaracas)).toBe("06/09/2026 22:00");
  });

  it("tolera null e inválido", () => {
    expect(formatDateTimeDMY(null)).toBe("—");
    expect(formatDateTimeDMY(undefined)).toBe("—");
    expect(formatDateTimeDMY("no es fecha")).toBe("—");
  });
});
