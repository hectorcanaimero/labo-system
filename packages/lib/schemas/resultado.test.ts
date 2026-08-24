import { describe, expect, it } from "vitest";
import {
  FECHA_MUESTRA_FUTURA,
  FECHA_RESULTADO_FUTURA,
  EXAMENES_REQUERIDOS,
  EXAMEN_ID_REQUERIDO,
  PACIENTE_ID_REQUERIDO,
  ESTADO_INVALIDO,
  lineaResultadoSchema,
  resultadoCreateSchema,
  resultadoUpdateSchema,
} from "./resultado";

const EXAMEN_ID = "j70abc12345678901234567890";

function linea(overrides: Record<string, unknown> = {}) {
  return { examen_id: EXAMEN_ID, valor: "12.5 g/dL", ...overrides };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    paciente_id: "j70paciente1234567890123456",
    fecha_muestra: Date.now() - 24 * 60 * 60 * 1000,
    examenes: [linea(), linea({ valor: "145 mg/dL" })],
    ...overrides,
  };
}

describe("lineaResultadoSchema", () => {
  it("acepta una línea válida", () => {
    const res = lineaResultadoSchema.safeParse(linea());
    expect(res.success).toBe(true);
  });

  it("acepta observacion opcional", () => {
    const res = lineaResultadoSchema.safeParse(
      linea({ observacion: "Muestra hemolizada" }),
    );
    expect(res.success).toBe(true);
  });

  it("rechaza examen_id vacío", () => {
    const res = lineaResultadoSchema.safeParse(linea({ examen_id: "" }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(EXAMEN_ID_REQUERIDO);
  });

  it("rechaza examen_id faltante", () => {
    const res = lineaResultadoSchema.safeParse({ valor: "x" });
    expect(res.success).toBe(false);
  });
});

describe("resultadoCreateSchema", () => {
  it("acepta un resultado válido con múltiples exámenes", () => {
    const res = resultadoCreateSchema.safeParse(createInput());
    expect(res.success).toBe(true);
  });

  it("acepta un solo examen", () => {
    const res = resultadoCreateSchema.safeParse(
      createInput({ examenes: [linea()] }),
    );
    expect(res.success).toBe(true);
  });

  it("rechaza examenes vacío", () => {
    const res = resultadoCreateSchema.safeParse(createInput({ examenes: [] }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(EXAMENES_REQUERIDOS);
  });

  it("rechaza examenes faltante", () => {
    const { examenes: _omit, ...rest } = createInput();
    const res = resultadoCreateSchema.safeParse(rest);
    expect(res.success).toBe(false);
  });

  it("rechaza fecha_muestra futura", () => {
    const res = resultadoCreateSchema.safeParse(
      createInput({ fecha_muestra: Date.now() + 60 * 60 * 1000 }),
    );
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(FECHA_MUESTRA_FUTURA);
  });

  it("acepta fecha_muestra exactamente ahora", () => {
    const res = resultadoCreateSchema.safeParse(
      createInput({ fecha_muestra: Date.now() }),
    );
    expect(res.success).toBe(true);
  });

  it("rechaza fecha_resultado futura", () => {
    const res = resultadoCreateSchema.safeParse(
      createInput({ fecha_resultado: Date.now() + 60 * 60 * 1000 }),
    );
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(FECHA_RESULTADO_FUTURA);
  });

  it("rechaza paciente_id vacío", () => {
    const res = resultadoCreateSchema.safeParse(createInput({ paciente_id: "" }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(PACIENTE_ID_REQUERIDO);
  });

  it("acepta campos opcionales omitidos", () => {
    const res = resultadoCreateSchema.safeParse(
      createInput({
        fecha_resultado: undefined,
        medico_solicitante: undefined,
        observaciones: undefined,
      }),
    );
    expect(res.success).toBe(true);
  });
});

describe("resultadoUpdateSchema", () => {
  it("acepta objeto vacío (todos los campos opcionales)", () => {
    const res = resultadoUpdateSchema.safeParse({});
    expect(res.success).toBe(true);
  });

  it("acepta solo cambio de estado", () => {
    const res = resultadoUpdateSchema.safeParse({ estado: "Completado" });
    expect(res.success).toBe(true);
  });

  it("rechaza estado inválido", () => {
    const res = resultadoUpdateSchema.safeParse({ estado: "EnProceso" });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(ESTADO_INVALIDO);
  });

  it("rechaza examenes vacío en update", () => {
    const res = resultadoUpdateSchema.safeParse({ examenes: [] });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(EXAMENES_REQUERIDOS);
  });

  it("acepta examenes no vacío en update", () => {
    const res = resultadoUpdateSchema.safeParse({ examenes: [linea()] });
    expect(res.success).toBe(true);
  });

  it("rechaza fecha_muestra futura en update", () => {
    const res = resultadoUpdateSchema.safeParse({
      fecha_muestra: Date.now() + 1000,
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(FECHA_MUESTRA_FUTURA);
  });
});
