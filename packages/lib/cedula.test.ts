import { describe, expect, it } from "vitest";
import {
  enmascararCedula,
  InvalidCedulaError,
  normalizeCedula,
  normalizeCedulaOrThrow,
} from "./cedula";

describe("normalizeCedula", () => {
  it("normalizes V- 33.338.896 (spec acceptance)", () => {
    expect(normalizeCedula("V- 33.338.896")).toBe("V-33338896");
  });

  it("normalizes v21197865 lowercase no separator (spec acceptance)", () => {
    expect(normalizeCedula("v21197865")).toBe("V-21197865");
  });

  it("returns null for XX-123 (spec acceptance)", () => {
    expect(normalizeCedula("XX-123")).toBeNull();
  });

  it("normalizes already-normalized V-21197865", () => {
    expect(normalizeCedula("V-21197865")).toBe("V-21197865");
  });

  it("normalizes V.21.197.865 (dots as separators)", () => {
    expect(normalizeCedula("V.21.197.865")).toBe("V-21197865");
  });

  it("normalizes V- 21.197.865 (mixed spaces and dots)", () => {
    expect(normalizeCedula("V- 21.197.865")).toBe("V-21197865");
  });

  it("normalizes E-8123456 (extranjero prefix)", () => {
    expect(normalizeCedula("E-8123456")).toBe("E-8123456");
  });

  it("normalizes e8123456 lowercase extranjero", () => {
    expect(normalizeCedula("e8123456")).toBe("E-8123456");
  });

  it("normalizes bare digits 21197865 assuming V prefix", () => {
    expect(normalizeCedula("21197865")).toBe("V-21197865");
  });

  it("normalizes J prefix (jurídico)", () => {
    expect(normalizeCedula("J-12345678")).toBe("J-12345678");
  });

  it("normalizes G prefix", () => {
    expect(normalizeCedula("G-12345678")).toBe("G-12345678");
  });

  it("normalizes P prefix", () => {
    expect(normalizeCedula("P-12345678")).toBe("P-12345678");
  });

  it("handles leading/trailing whitespace", () => {
    expect(normalizeCedula("  V-21197865  ")).toBe("V-21197865");
  });

  it("handles multiple spaces between prefix and digits", () => {
    expect(normalizeCedula("V-   21197865")).toBe("V-21197865");
  });

  it("handles double dashes", () => {
    expect(normalizeCedula("V--21197865")).toBe("V-21197865");
  });

  it("normalizes 5-digit cedula (minimum length)", () => {
    expect(normalizeCedula("V-12345")).toBe("V-12345");
  });

  it("normalizes 9-digit cedula (maximum length)", () => {
    expect(normalizeCedula("V-123456789")).toBe("V-123456789");
  });

  it("returns null for 4 digits (too short)", () => {
    expect(normalizeCedula("V-1234")).toBeNull();
  });

  it("returns null for 10 digits (too long)", () => {
    expect(normalizeCedula("V-1234567890")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeCedula("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeCedula("   ")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(normalizeCedula(null as unknown as string)).toBeNull();
    expect(normalizeCedula(undefined as unknown as string)).toBeNull();
    expect(normalizeCedula(12345 as unknown as string)).toBeNull();
  });

  it("returns null for letters-only input", () => {
    expect(normalizeCedula("ABCDEF")).toBeNull();
  });

  it("returns null for invalid prefix X", () => {
    expect(normalizeCedula("X-12345678")).toBeNull();
  });

  it("returns null for special characters", () => {
    expect(normalizeCedula("V-12@45#678")).toBeNull();
  });

  it("handles tab characters in input (tabs stripped as whitespace)", () => {
    expect(normalizeCedula("V-\t21197865")).toBe("V-21197865");
  });
});

describe("normalizeCedulaOrThrow", () => {
  it("returns normalized cedula for valid input", () => {
    expect(normalizeCedulaOrThrow("V- 33.338.896")).toBe("V-33338896");
  });

  it("throws InvalidCedulaError for invalid input", () => {
    expect(() => normalizeCedulaOrThrow("XX-123")).toThrow(InvalidCedulaError);
  });

  it("throws with raw value in message", () => {
    expect(() => normalizeCedulaOrThrow("invalid")).toThrow(/invalid/);
  });
});

describe("enmascararCedula", () => {
  it("deja visibles sólo los dos últimos dígitos, con grupos de miles", () => {
    expect(enmascararCedula("V-12345678")).toBe("V-**.***.*78");
    expect(enmascararCedula("E-123456789")).toBe("E-***.***.*89");
    expect(enmascararCedula("V-1234567")).toBe("V-*.***.*67");
  });

  it("acepta cualquier prefijo que produce normalizeCedula", () => {
    for (const prefijo of ["V", "E", "J", "G", "P"]) {
      expect(enmascararCedula(`${prefijo}-12345678`)).toBe(`${prefijo}-**.***.*78`);
    }
  });

  it("es consistente con la salida de normalizeCedula", () => {
    const normalizada = normalizeCedula("v 12.345.678");
    expect(normalizada).toBe("V-12345678");
    expect(enmascararCedula(normalizada!)).toBe("V-**.***.*78");
  });

  // Falla cerrado: ante un formato que no entiende NO devuelve el valor
  // original, porque su único trabajo es no filtrar la cédula.
  it.each([
    "12345678",
    "V12345678",
    "V-12.345.678",
    "X-12345678",
    "V-",
    "cualquier cosa",
  ])("no filtra el valor original ante formato desconocido: %j", (raw) => {
    const salida = enmascararCedula(raw);
    expect(salida).toBe("***");
    expect(salida).not.toContain("12345678");
  });

  it("vacío, null y undefined dan guion", () => {
    expect(enmascararCedula("")).toBe("—");
    expect(enmascararCedula("   ")).toBe("—");
    expect(enmascararCedula(null)).toBe("—");
    expect(enmascararCedula(undefined)).toBe("—");
  });
});
