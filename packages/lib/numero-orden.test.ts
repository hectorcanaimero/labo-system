import { describe, expect, it } from "vitest";
import { formatNumeroOrden, parseNumeroOrden } from "./numero-orden";

describe("formatNumeroOrden", () => {
  it("127 en 2026 → 'RS-2026-000127'", () => {
    expect(formatNumeroOrden(127, "2026-08-31T12:00:00Z")).toBe("RS-2026-000127");
  });

  it("1 → padea a 6 dígitos", () => {
    expect(formatNumeroOrden(1, new Date("2026-01-01T00:00:00Z"))).toBe("RS-2026-000001");
  });

  it("1234567 → no trunca, crece más allá de 6 dígitos", () => {
    expect(formatNumeroOrden(1234567, "2026-01-01T00:00:00Z")).toBe("RS-2026-1234567");
  });

  it("usa el año de created_at, no el actual", () => {
    expect(formatNumeroOrden(5, "2020-05-01T00:00:00Z")).toBe("RS-2020-000005");
  });

  it("created_at inválido cae al año actual", () => {
    expect(formatNumeroOrden(5, "fecha-invalida")).toBe(`RS-${new Date().getUTCFullYear()}-000005`);
  });
});

describe("parseNumeroOrden", () => {
  it("'RS-2026-000123' → 123", () => {
    expect(parseNumeroOrden("RS-2026-000123")).toBe(123);
  });

  it("'rs-2026-123' (minúsculas, sin padding) → 123", () => {
    expect(parseNumeroOrden("rs-2026-123")).toBe(123);
  });

  it("'000123' → 123", () => {
    expect(parseNumeroOrden("000123")).toBe(123);
  });

  it("'123' → 123", () => {
    expect(parseNumeroOrden("123")).toBe(123);
  });

  it("recorta espacios alrededor", () => {
    expect(parseNumeroOrden("  123  ")).toBe(123);
  });

  it("un apellido no matchea", () => {
    expect(parseNumeroOrden("Pérez")).toBeNull();
  });

  it("'RS-2026-abc' no matchea", () => {
    expect(parseNumeroOrden("RS-2026-abc")).toBeNull();
  });

  it("'0' no es un número correlativo válido", () => {
    expect(parseNumeroOrden("0")).toBeNull();
  });

  it("string vacío no matchea", () => {
    expect(parseNumeroOrden("")).toBeNull();
  });
});
