import { describe, expect, it } from "vitest";

import { examenCreate, examenUpdate } from "./examen";

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    titulo_id: "titulo-hematologia",
    nombre: "Hemoglobina",
    precio_usd: 12.5,
    ...overrides,
  };
}

describe("examenCreate", () => {
  it("acepta tipo_analisis y metodo opcionales omitidos", () => {
    const result = examenCreate.parse(createInput());

    expect(result.tipo_analisis).toBeUndefined();
    expect(result.metodo).toBeUndefined();
  });

  it("sanitiza tipo_analisis y metodo", () => {
    const result = examenCreate.parse(
      createInput({
        tipo_analisis: "  Hematología  ",
        metodo: "  Impedancia eléctrica  ",
      }),
    );

    expect(result.tipo_analisis).toBe("Hematología");
    expect(result.metodo).toBe("Impedancia eléctrica");
  });

  it("rechaza tipo_analisis y metodo que no sean strings", () => {
    expect(
      examenCreate.safeParse(createInput({ tipo_analisis: 123 })).success,
    ).toBe(false);
    expect(examenCreate.safeParse(createInput({ metodo: true })).success).toBe(
      false,
    );
  });
});

describe("examenUpdate", () => {
  it("acepta actualización parcial de tipo_analisis y metodo", () => {
    const result = examenUpdate.parse({
      tipo_analisis: "  Química clínica ",
      metodo: " Colorimetría  ",
    });

    expect(result).toEqual({
      tipo_analisis: "Química clínica",
      metodo: "Colorimetría",
    });
  });

  it("acepta un objeto vacío", () => {
    expect(examenUpdate.safeParse({}).success).toBe(true);
  });
});
