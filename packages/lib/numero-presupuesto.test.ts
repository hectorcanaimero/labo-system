import { describe, expect, it } from "vitest";
import { formatNumeroPresupuesto, parseNumeroPresupuesto } from "./numero-presupuesto";

describe("formatNumeroPresupuesto", () => {
  it("arma PR-{año}-{000123} con el año de created_at", () => {
    expect(formatNumeroPresupuesto(123, "2026-01-15T00:00:00.000Z")).toBe("PR-2026-000123");
  });
});

describe("parseNumeroPresupuesto", () => {
  it("acepta el número formateado completo", () => {
    expect(parseNumeroPresupuesto("PR-2026-000123")).toBe(123);
  });

  it("acepta el prefijo en minúscula y sin ceros a la izquierda", () => {
    expect(parseNumeroPresupuesto("pr-2026-123")).toBe(123);
  });

  it("acepta el número pelado con ceros a la izquierda", () => {
    expect(parseNumeroPresupuesto("000123")).toBe(123);
  });

  it("acepta el número pelado sin ceros", () => {
    expect(parseNumeroPresupuesto("123")).toBe(123);
  });

  it("devuelve null para un apellido", () => {
    expect(parseNumeroPresupuesto("Pérez")).toBeNull();
  });

  it("devuelve null para una cédula", () => {
    expect(parseNumeroPresupuesto("V-12345678")).toBeNull();
  });

  it("devuelve null para string vacío", () => {
    expect(parseNumeroPresupuesto("   ")).toBeNull();
  });

  it("devuelve null para 0", () => {
    expect(parseNumeroPresupuesto("0")).toBeNull();
  });
});
