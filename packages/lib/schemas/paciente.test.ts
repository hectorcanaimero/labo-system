import { describe, expect, it } from "vitest";

import {
  pacienteCreate,
  pacienteSearch,
  pacienteUpdate,
  CEDULA_INVALIDA,
  CEDULA_PREFIJO_INVALIDO,
  FECHA_NACIMIENTO_FUTURA,
  NOMBRE_REQUERIDO,
} from "./paciente";

function pacienteBase(overrides: Record<string, unknown> = {}) {
  return {
    nombre: "Juan",
    apellido: "Pérez",
    cedula: "V-21197865",
    fecha_nacimiento: new Date("1990-05-15T00:00:00.000Z"),
    ...overrides,
  };
}

describe("pacienteCreate — nombre", () => {
  it("rechaza nombre vacío", () => {
    const result = pacienteCreate.safeParse(pacienteBase({ nombre: "" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(NOMBRE_REQUERIDO);
    }
  });

  it("rechaza nombre con solo espacios", () => {
    expect(pacienteCreate.safeParse(pacienteBase({ nombre: "   " })).success).toBe(false);
  });

  it("trimea nombre válido", () => {
    const result = pacienteCreate.parse(pacienteBase({ nombre: "  Juan  " }));
    expect(result.nombre).toBe("Juan");
  });
});

describe("pacienteCreate — cedula", () => {
  it("transforma cédula raw a normalizada (V- 33.338.896)", () => {
    const result = pacienteCreate.parse(pacienteBase({ cedula: "V- 33.338.896" }));
    expect(result.cedula).toBe("V-33338896");
  });

  it("transforma cédula raw a normalizada (v21197865 lowercase)", () => {
    const result = pacienteCreate.parse(pacienteBase({ cedula: "v21197865" }));
    expect(result.cedula).toBe("V-21197865");
  });

  it("normaliza extranjero E-8123456", () => {
    const result = pacienteCreate.parse(pacienteBase({ cedula: "E-8123456" }));
    expect(result.cedula).toBe("E-8123456");
  });

  it("acepta dígitos sin prefijo asumiendo V", () => {
    const result = pacienteCreate.parse(pacienteBase({ cedula: "21197865" }));
    expect(result.cedula).toBe("V-21197865");
  });

  it("rechaza prefijo J (jurídico) — sin prefijo V/E", () => {
    const result = pacienteCreate.safeParse(pacienteBase({ cedula: "J-12345678" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(CEDULA_PREFIJO_INVALIDO);
    }
  });

  it("rechaza prefijo G (gobierno) — sin prefijo V/E", () => {
    expect(pacienteCreate.safeParse(pacienteBase({ cedula: "G-12345678" })).success).toBe(false);
  });

  it("rechaza prefijo P (pasaporte) — sin prefijo V/E", () => {
    expect(pacienteCreate.safeParse(pacienteBase({ cedula: "P-12345678" })).success).toBe(false);
  });

  it("rechaza cédula inválida (XX-123)", () => {
    const result = pacienteCreate.safeParse(pacienteBase({ cedula: "XX-123" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(CEDULA_INVALIDA);
    }
  });

  it("rechaza cédula vacía", () => {
    expect(pacienteCreate.safeParse(pacienteBase({ cedula: "" })).success).toBe(false);
  });

  it("rechaza cédula con caracteres raros", () => {
    const res = pacienteCreate.safeParse(pacienteBase({ cedula: "V-1234@#!" }));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe(CEDULA_INVALIDA);
    }
  });

  it("rechaza cédula con letras mezcladas", () => {
    expect(pacienteCreate.safeParse(pacienteBase({ cedula: "V-12ab3456" })).success).toBe(false);
  });
});

describe("pacienteCreate — fecha_nacimiento", () => {
  it("transforma Date a timestamp number", () => {
    const date = new Date("1990-05-15T00:00:00.000Z");
    const result = pacienteCreate.parse(pacienteBase({ fecha_nacimiento: date }));
    expect(result.fecha_nacimiento).toBe(date.getTime());
    expect(typeof result.fecha_nacimiento).toBe("number");
  });

  it("rechaza fecha de nacimiento futura", () => {
    const futuro = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = pacienteCreate.safeParse(pacienteBase({ fecha_nacimiento: futuro }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(FECHA_NACIMIENTO_FUTURA);
    }
  });

  it("acepta fecha pasada", () => {
    expect(
      pacienteCreate.safeParse(pacienteBase({ fecha_nacimiento: new Date("1980-01-01") })).success,
    ).toBe(true);
  });
});

describe("pacienteCreate — sexo", () => {
  it("acepta sexo válido", () => {
    expect(pacienteCreate.parse(pacienteBase({ sexo: "F" })).sexo).toBe("F");
  });

  it("rechaza sexo inválido", () => {
    expect(pacienteCreate.safeParse(pacienteBase({ sexo: "X" })).success).toBe(false);
  });

  it("permite sexo ausente", () => {
    const input = {
      nombre: "Juan",
      apellido: "Pérez",
      cedula: "V-21197865",
      fecha_nacimiento: new Date("1990-05-15T00:00:00.000Z"),
    };
    expect(pacienteCreate.parse(input).sexo).toBeUndefined();
  });
});

describe("pacienteUpdate", () => {
  it("permite actualización parcial (solo nombre)", () => {
    const result = pacienteUpdate.parse({ nombre: "Juan Carlos" });
    expect(result.nombre).toBe("Juan Carlos");
    expect(result.cedula).toBeUndefined();
  });

  it("normaliza cédula si viene en el update", () => {
    const result = pacienteUpdate.parse({ cedula: "V- 33.338.896" });
    expect(result.cedula).toBe("V-33338896");
  });

  it("rechaza cédula con prefijo inválido en update", () => {
    expect(pacienteUpdate.safeParse({ cedula: "J-12345678" }).success).toBe(false);
  });

  it("transforma fecha_nacimiento a timestamp en update", () => {
    const date = new Date("1990-05-15T00:00:00.000Z");
    const result = pacienteUpdate.parse({ fecha_nacimiento: date });
    expect(result.fecha_nacimiento).toBe(date.getTime());
  });

  it("rechaza fecha futura en update", () => {
    const futuro = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(pacienteUpdate.safeParse({ fecha_nacimiento: futuro }).success).toBe(false);
  });
});

describe("pacienteSearch", () => {
  it("acepta término de búsqueda", () => {
    expect(pacienteSearch.parse({ term: "Juan" }).term).toBe("Juan");
  });

  it("trimea el término", () => {
    expect(pacienteSearch.parse({ term: "  Juan  " }).term).toBe("Juan");
  });
});
