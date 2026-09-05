import { describe, expect, it } from "vitest";

import {
  DESCUENTO_FUERA_RANGO,
  EXAMENES_REQUERIDOS,
  EXAMEN_ID_REQUERIDO,
  GANANCIA_NEGATIVA,
  MOTIVO_RECHAZO_REQUERIDO,
  PACIENTE_XOR_REQUERIDO,
  PRECIO_INVALIDO,
  PresupuestoEstadoEnum,
  TASA_INVALIDA,
  descuentoPctSchema,
  estadoPresupuestoSchema,
  gananciaPctSchema,
  lineaPresupuestoSchema,
  presupuestoCambiarEstadoSchema,
  presupuestoCreateSchema,
  presupuestoUpdateSchema,
  tasaBsSchema,
} from "./presupuesto";

const EXAMEN_ID = "j70abc12345678901234567890";

function linea(overrides: Record<string, unknown> = {}) {
  return { examen_id: EXAMEN_ID, ...overrides };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    paciente_id: "j70paciente1234567890123456",
    descuento_pct: 10,
    ganancia_pct: 30,
    tasa_bs: 36.5,
    examenes: [linea(), linea({ examen_id: "j70def12345678901234567890" })],
    ...overrides,
  };
}

describe("lineaPresupuestoSchema", () => {
  it("acepta una línea válida", () => {
    expect(lineaPresupuestoSchema.safeParse(linea()).success).toBe(true);
  });

  it("rechaza examen_id vacío", () => {
    const res = lineaPresupuestoSchema.safeParse(linea({ examen_id: "" }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(EXAMEN_ID_REQUERIDO);
  });

  it("rechaza examen_id faltante", () => {
    expect(lineaPresupuestoSchema.safeParse({}).success).toBe(false);
  });

  it("acepta línea con pricing completo de paquete", () => {
    const res = lineaPresupuestoSchema.safeParse(
      linea({
        paquete_id: "j70paquete1234567890123456",
        precio_base_snap: 50,
        ganancia_pct: 25,
        precio_final_snap: 62.5,
      }),
    );
    expect(res.success).toBe(true);
  });

  it("rechaza precio_base_snap negativo", () => {
    const res = lineaPresupuestoSchema.safeParse(linea({ precio_base_snap: -1 }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(PRECIO_INVALIDO);
  });

  it("rechaza precio_final_snap negativo", () => {
    const res = lineaPresupuestoSchema.safeParse(linea({ precio_final_snap: -0.01 }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(PRECIO_INVALIDO);
  });

  it("rechaza ganancia_pct negativa en la línea", () => {
    const res = lineaPresupuestoSchema.safeParse(linea({ ganancia_pct: -5 }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(GANANCIA_NEGATIVA);
  });

  it("rechaza paquete_id vacío", () => {
    expect(lineaPresupuestoSchema.safeParse(linea({ paquete_id: "" })).success).toBe(false);
  });
});

describe("descuentoPctSchema", () => {
  it("acepta 0", () => {
    expect(descuentoPctSchema.safeParse(0).success).toBe(true);
  });

  it("acepta 100", () => {
    expect(descuentoPctSchema.safeParse(100).success).toBe(true);
  });

  it("acepta descuento intermedio", () => {
    expect(descuentoPctSchema.safeParse(15.5).success).toBe(true);
  });

  it("rechaza 150 (fuera de rango)", () => {
    const res = descuentoPctSchema.safeParse(150);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(DESCUENTO_FUERA_RANGO);
  });

  it("rechaza descuento negativo", () => {
    const res = descuentoPctSchema.safeParse(-1);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(DESCUENTO_FUERA_RANGO);
  });

  it("rechaza no-número", () => {
    expect(descuentoPctSchema.safeParse("10").success).toBe(false);
  });
});

describe("gananciaPctSchema", () => {
  it("acepta 0", () => {
    expect(gananciaPctSchema.safeParse(0).success).toBe(true);
  });

  it("acepta ganancia positiva", () => {
    expect(gananciaPctSchema.safeParse(45).success).toBe(true);
  });

  it("rechaza ganancia negativa", () => {
    const res = gananciaPctSchema.safeParse(-5);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(GANANCIA_NEGATIVA);
  });
});

describe("tasaBsSchema", () => {
  it("acepta tasa positiva", () => {
    expect(tasaBsSchema.safeParse(36.5).success).toBe(true);
  });

  it("acepta tasa mínima mayor que 0", () => {
    expect(tasaBsSchema.safeParse(0.0001).success).toBe(true);
  });

  it("rechaza tasa 0", () => {
    const res = tasaBsSchema.safeParse(0);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(TASA_INVALIDA);
  });

  it("rechaza tasa negativa", () => {
    const res = tasaBsSchema.safeParse(-10);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(TASA_INVALIDA);
  });
});

describe("presupuestoCreateSchema", () => {
  it("acepta presupuesto con paciente_id", () => {
    const res = presupuestoCreateSchema.safeParse(createInput());
    expect(res.success).toBe(true);
  });

  it("acepta presupuesto con paciente_nombre_libre", () => {
    const res = presupuestoCreateSchema.safeParse(
      createInput({ paciente_id: undefined, paciente_nombre_libre: "Walk-in" }),
    );
    expect(res.success).toBe(true);
  });

  it("acepta descuento 100%", () => {
    expect(presupuestoCreateSchema.safeParse(createInput({ descuento_pct: 100 })).success).toBe(true);
  });

  it("rechaza descuento 150%", () => {
    const res = presupuestoCreateSchema.safeParse(createInput({ descuento_pct: 150 }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(DESCUENTO_FUERA_RANGO);
  });

  it("rechaza ganancia negativa", () => {
    const res = presupuestoCreateSchema.safeParse(createInput({ ganancia_pct: -1 }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(GANANCIA_NEGATIVA);
  });

  it("rechaza tasa 0", () => {
    const res = presupuestoCreateSchema.safeParse(createInput({ tasa_bs: 0 }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(TASA_INVALIDA);
  });

  it("rechaza examen vacío", () => {
    const res = presupuestoCreateSchema.safeParse(createInput({ examenes: [] }));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(EXAMENES_REQUERIDOS);
  });

  it("acepta ganancia por línea distinta a la global", () => {
    const res = presupuestoCreateSchema.safeParse(
      createInput({
        ganancia_pct: 30,
        examenes: [linea({ ganancia_pct: 50 }), linea({ examen_id: "j70def12345678901234567890" })],
      }),
    );
    expect(res.success).toBe(true);
  });

  it("rechaza ganancia por línea negativa aunque la global sea válida", () => {
    const res = presupuestoCreateSchema.safeParse(
      createInput({
        examenes: [linea({ ganancia_pct: -10 })],
      }),
    );
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(GANANCIA_NEGATIVA);
  });

  it("rechaza examenes faltante", () => {
    const rest = createInput() as Record<string, unknown>;
    delete rest.examenes;
    const res = presupuestoCreateSchema.safeParse(rest);
    expect(res.success).toBe(false);
  });

  describe("XOR paciente", () => {
    it("rechaza ambos (paciente_id + nombre_libre)", () => {
      const res = presupuestoCreateSchema.safeParse(
        createInput({ paciente_nombre_libre: "Walk-in" }),
      );
      expect(res.success).toBe(false);
      expect(res.error?.issues[0]?.message).toBe(PACIENTE_XOR_REQUERIDO);
    });

    it("rechaza ninguno (sin paciente_id ni nombre_libre)", () => {
      const res = presupuestoCreateSchema.safeParse(
        createInput({ paciente_id: undefined }),
      );
      expect(res.success).toBe(false);
      expect(res.error?.issues[0]?.message).toBe(PACIENTE_XOR_REQUERIDO);
    });

    it("rechaza nombre_libre vacío", () => {
      const res = presupuestoCreateSchema.safeParse(
        createInput({ paciente_id: undefined, paciente_nombre_libre: "   " }),
      );
      expect(res.success).toBe(false);
    });
  });
});

describe("presupuestoUpdateSchema", () => {
  it("acepta objeto vacío (todos los campos opcionales)", () => {
    expect(presupuestoUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("acepta cambio de estado", () => {
    expect(presupuestoUpdateSchema.safeParse({ estado: "Aprobado" }).success).toBe(true);
  });

  it("acepta cambio de descuento dentro de rango", () => {
    expect(presupuestoUpdateSchema.safeParse({ descuento_pct: 20 }).success).toBe(true);
  });

  it("rechaza descuento 150% en update", () => {
    const res = presupuestoUpdateSchema.safeParse({ descuento_pct: 150 });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(DESCUENTO_FUERA_RANGO);
  });

  it("rechaza estado inválido", () => {
    expect(
      presupuestoUpdateSchema.safeParse({ estado: "Archivado" }).success,
    ).toBe(false);
  });

  it("rechaza setear paciente_id y nombre_libre a la vez", () => {
    const res = presupuestoUpdateSchema.safeParse({
      paciente_id: "j70paciente1234567890123456",
      paciente_nombre_libre: "Walk-in",
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(PACIENTE_XOR_REQUERIDO);
  });

  it("acepta setear solo paciente_id", () => {
    expect(
      presupuestoUpdateSchema.safeParse({ paciente_id: "j70paciente1234567890123456" }).success,
    ).toBe(true);
  });

  it("rechaza examenes vacío en update", () => {
    const res = presupuestoUpdateSchema.safeParse({ examenes: [] });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe(EXAMENES_REQUERIDOS);
  });
});

describe("estadoPresupuestoSchema", () => {
  it("acepta estados válidos", () => {
    for (const estado of [
      "Borrador",
      "Enviado",
      "Aprobado",
      "Rechazado",
      "Cancelado",
      "Cerrado",
    ]) {
      expect(estadoPresupuestoSchema.safeParse(estado).success).toBe(true);
      expect(PresupuestoEstadoEnum.safeParse(estado).success).toBe(true);
    }
  });

  it("rechaza estado inválido", () => {
    expect(estadoPresupuestoSchema.safeParse("Archivado").success).toBe(false);
    // "Convertido" fue el nombre viejo del estado terminal; hoy es "Cerrado".
    expect(estadoPresupuestoSchema.safeParse("Convertido").success).toBe(false);
  });
});

describe("presupuestoCambiarEstadoSchema", () => {
  it("acepta Rechazado con un motivo de al menos 3 caracteres", () => {
    const res = presupuestoCambiarEstadoSchema.safeParse({
      estado: "Rechazado",
      motivo_rechazo: "Sin disponibilidad",
    });

    expect(res.success).toBe(true);
  });

  it("rechaza Rechazado sin motivo", () => {
    const res = presupuestoCambiarEstadoSchema.safeParse({
      estado: "Rechazado",
    });

    expect(res.success).toBe(false);
    expect(res.error?.issues[0]).toMatchObject({
      message: MOTIVO_RECHAZO_REQUERIDO,
      path: ["motivo_rechazo"],
    });
  });

  it.each(["", "  ", "ab", " ab "])(
    "rechaza Rechazado con motivo insuficiente: %j",
    (motivo_rechazo) => {
      const res = presupuestoCambiarEstadoSchema.safeParse({
        estado: "Rechazado",
        motivo_rechazo,
      });

      expect(res.success).toBe(false);
      expect(res.error?.issues[0]?.message).toBe(MOTIVO_RECHAZO_REQUERIDO);
    },
  );

  it("acepta otros estados sin motivo de rechazo", () => {
    for (const estado of [
      "Borrador",
      "Enviado",
      "Aprobado",
      "Cancelado",
      "Cerrado",
    ]) {
      expect(
        presupuestoCambiarEstadoSchema.safeParse({ estado }).success,
      ).toBe(true);
    }
  });
});
