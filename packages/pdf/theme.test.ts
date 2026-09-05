import { describe, expect, it } from "vitest";

import { assetOrNull, formatDateDMY } from "./theme";

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
