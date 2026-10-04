import { describe, expect, it } from "vitest";

import { formatTelefonoVeMask } from "./telefono";

describe("formatTelefonoVeMask", () => {
  it("respeta un número pegado con +58", () => {
    expect(formatTelefonoVeMask("+58 424-1234567")).toBe("+58 424-1234567");
  });

  it("pegar encima de un +58 ya escrito no duplica el código de país", () => {
    expect(formatTelefonoVeMask("+58 +58 424-1234567")).toBe("+58 424-1234567");
  });

  it("sin código de país ni 0 inicial asume +58", () => {
    expect(formatTelefonoVeMask("4127654321")).toBe("+58 412-7654321");
    expect(formatTelefonoVeMask("584127654321")).toBe("+58 412-7654321");
  });

  it("+58 con 0 de troncal lo descarta", () => {
    expect(formatTelefonoVeMask("+58 0412 7654321")).toBe("+58 412-7654321");
  });

  it("mantiene el formato nacional con 0", () => {
    expect(formatTelefonoVeMask("04127654321")).toBe("0412-7654321");
  });

  it("permite borrar el prefijo", () => {
    expect(formatTelefonoVeMask("+58 ")).toBe("+58");
    expect(formatTelefonoVeMask("+5")).toBe("+5");
    expect(formatTelefonoVeMask("")).toBe("");
  });
});
