import { describe, expect, it } from "vitest";

import { TIPO_ANALISIS_VALUES, examenCreate, examenUpdate } from "./examen";

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    titulo_id: "titulo-hematologia",
    nombre: "Hemoglobina",
    precio_usd: 12.5,
    tipo_analisis: "Análisis Hematológico",
    ...overrides,
  };
}

describe("examenCreate", () => {
  it("exige tipo_analisis (enum) y deja metodo opcional", () => {
    const result = examenCreate.parse(createInput());
    expect(result.tipo_analisis).toBe("Análisis Hematológico");
    expect(result.metodo).toBeUndefined();

    const sinTipo = examenCreate.safeParse(createInput({ tipo_analisis: undefined }));
    expect(sinTipo.success).toBe(false);
    expect(sinTipo.error?.issues[0]).toMatchObject({
      path: ["tipo_analisis"],
      message: "TIPO_ANALISIS_REQUERIDO",
    });
  });

  it("acepta todos los valores del enum de tipo_analisis", () => {
    for (const tipo of TIPO_ANALISIS_VALUES) {
      expect(examenCreate.safeParse(createInput({ tipo_analisis: tipo })).success).toBe(true);
    }
  });

  it("rechaza un tipo_analisis fuera del enum (aunque sea texto plausible)", () => {
    expect(examenCreate.safeParse(createInput({ tipo_analisis: "Hematología" })).success).toBe(false);
    expect(examenCreate.safeParse(createInput({ tipo_analisis: 123 })).success).toBe(false);
  });

  it("sanitiza metodo y rechaza metodo que no sea string", () => {
    const result = examenCreate.parse(createInput({ metodo: "  Impedancia eléctrica  " }));
    expect(result.metodo).toBe("Impedancia eléctrica");
    expect(examenCreate.safeParse(createInput({ metodo: true })).success).toBe(false);
  });
});

describe("examenUpdate", () => {
  it("acepta actualización parcial de tipo_analisis y metodo", () => {
    const result = examenUpdate.parse({
      tipo_analisis: "Análisis Químico",
      metodo: " Colorimetría  ",
    });

    expect(result).toEqual({
      tipo_analisis: "Análisis Químico",
      metodo: "Colorimetría",
    });
  });

  it("acepta un objeto vacío", () => {
    expect(examenUpdate.safeParse({}).success).toBe(true);
  });
});
