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

  it("acepta los ocho valores con los que se sembró la tabla", () => {
    for (const tipo of TIPO_ANALISIS_VALUES) {
      expect(examenCreate.safeParse(createInput({ tipo_analisis: tipo })).success).toBe(true);
    }
  });

  // F7.4.T3: el vocabulario lo da `tipos_analisis`, no un enum en el código.
  // El schema sólo exige texto con contenido; validar contra la lista acá
  // haría que un examen con el tipo desactivado o renombrado no se pudiera
  // volver a guardar.
  it("acepta un tipo fuera de la semilla, porque el vocabulario es la tabla", () => {
    expect(examenCreate.safeParse(createInput({ tipo_analisis: "Citogenética" })).success).toBe(
      true,
    );
  });

  it.each(["", "   ", 123, null, undefined])("rechaza un tipo vacío o no textual: %p", (tipo) => {
    const res = examenCreate.safeParse(createInput({ tipo_analisis: tipo }));
    expect(res.success).toBe(false);
  });

  it("recorta los espacios del tipo", () => {
    const res = examenCreate.parse(createInput({ tipo_analisis: "  Análisis Hormonal  " }));
    expect(res.tipo_analisis).toBe("Análisis Hormonal");
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
