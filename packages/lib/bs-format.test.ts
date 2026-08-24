import { describe, expect, it } from "vitest";
import { formatBs, formatUsd, roundBs, roundHalfUp, roundUsd } from "./bs-format";

describe("roundHalfUp", () => {
  it("0.005 half-up → 0.01", () => {
    expect(roundHalfUp(0.005)).toBe(0.01);
  });

  it("0.015 half-up → 0.02", () => {
    expect(roundHalfUp(0.015)).toBe(0.02);
  });

  it("1.005 → 1.01 (evita error IEEE 754 de 1.005 * 100)", () => {
    expect(roundHalfUp(1.005)).toBe(1.01);
  });

  it("2.675 → 2.68 (clásico IEEE 754)", () => {
    expect(roundHalfUp(2.675)).toBe(2.68);
  });

  it("-0.005 → -0.01 (half away from zero)", () => {
    expect(roundHalfUp(-0.005)).toBe(-0.01);
  });

  it("-1.005 → -1.01", () => {
    expect(roundHalfUp(-1.005)).toBe(-1.01);
  });

  it("-2.675 → -2.68", () => {
    expect(roundHalfUp(-2.675)).toBe(-2.68);
  });

  it("1.4999 → 1.5 (debajo del medio NO sube)", () => {
    expect(roundHalfUp(1.4999)).toBe(1.5);
  });

  it("1.494 → 1.49", () => {
    expect(roundHalfUp(1.494)).toBe(1.49);
  });

  it("0.1 + 0.2 → 0.3 (suma punto flotante)", () => {
    expect(roundHalfUp(0.1 + 0.2)).toBe(0.3);
  });

  it("redondea a `decimals` personalizado", () => {
    expect(roundHalfUp(1.2345, 3)).toBe(1.235);
    expect(roundHalfUp(0.005, 3)).toBe(0.005);
  });

  it("devuelve valores no finitos intactos", () => {
    expect(roundHalfUp(Number.NaN)).toBeNaN();
    expect(roundHalfUp(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("roundBs", () => {
  it("0.005 → 0.01", () => {
    expect(roundBs(0.005)).toBe(0.01);
  });

  it("0 → 0", () => {
    expect(roundBs(0)).toBe(0);
  });

  it("1000 → 1000 (entero)", () => {
    expect(roundBs(1000)).toBe(1000);
  });

  it("123.456 → 123.46", () => {
    expect(roundBs(123.456)).toBe(123.46);
  });

  it("19.999 → 20", () => {
    expect(roundBs(19.999)).toBe(20);
  });
});

describe("roundUsd", () => {
  it("0.005 → 0.01", () => {
    expect(roundUsd(0.005)).toBe(0.01);
  });

  it("2.675 → 2.68", () => {
    expect(roundUsd(2.675)).toBe(2.68);
  });

  it("-1.005 → -1.01", () => {
    expect(roundUsd(-1.005)).toBe(-1.01);
  });
});

describe("formatBs", () => {
  it("1234567.89 → '1.234.567,89' (miles '.', decimal ',')", () => {
    expect(formatBs(1234567.89)).toBe("1.234.567,89");
  });

  it("1000 → '1.000,00'", () => {
    expect(formatBs(1000)).toBe("1.000,00");
  });

  it("-1234.5 → '-1.234,50'", () => {
    expect(formatBs(-1234.5)).toBe("-1.234,50");
  });

  it("1.005 → '1,01' (aplica redondeo half-up antes de formatear)", () => {
    expect(formatBs(1.005)).toBe("1,01");
  });
});

describe("formatUsd", () => {
  it("1234567.89 → '1,234,567.89' (miles ',', decimal '.')", () => {
    expect(formatUsd(1234567.89)).toBe("1,234,567.89");
  });

  it("123.4 → '123.40'", () => {
    expect(formatUsd(123.4)).toBe("123.40");
  });

  it("-0.005 → '-0.01'", () => {
    expect(formatUsd(-0.005)).toBe("-0.01");
  });
});
