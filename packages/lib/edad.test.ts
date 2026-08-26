import { describe, expect, it } from "vitest";
import { calcularEdadDesglosada } from "./edad";

function utc(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes, dia));
}

describe("calcularEdadDesglosada — cálculo exacto", () => {
  it("15 días exactos", () => {
    expect(calcularEdadDesglosada(utc(2023, 0, 10), utc(2023, 0, 25))).toEqual({
      anos: 0,
      meses: 0,
      dias: 15,
      etapa: "Neonato",
      textoFormateado: "15 días",
    });
  });

  it("misma fecha → 0 años 0 meses 0 días", () => {
    const resultado = calcularEdadDesglosada(utc(2023, 4, 10), utc(2023, 4, 10));
    expect(resultado).toEqual({
      anos: 0,
      meses: 0,
      dias: 0,
      etapa: "Neonato",
      textoFormateado: "0 días",
    });
  });

  it("4 meses 12 días", () => {
    expect(calcularEdadDesglosada(utc(2023, 0, 1), utc(2023, 4, 13))).toEqual({
      anos: 0,
      meses: 4,
      dias: 12,
      etapa: "Lactante menor",
      textoFormateado: "4 meses 12 días",
    });
  });

  it("3 años 2 meses (días omitidos al tener años)", () => {
    const resultado = calcularEdadDesglosada(utc(2020, 0, 1), utc(2023, 2, 5));
    expect(resultado).toEqual({
      anos: 3,
      meses: 2,
      dias: 4,
      etapa: "Preescolar",
      textoFormateado: "3 años 2 meses",
    });
  });

  it("28 años exactos", () => {
    expect(calcularEdadDesglosada(utc(1995, 0, 1), utc(2023, 0, 1))).toEqual({
      anos: 28,
      meses: 0,
      dias: 0,
      etapa: "Adulto",
      textoFormateado: "28 años",
    });
  });

  it("cumple años exacto → 1 año 0 meses 0 días", () => {
    expect(calcularEdadDesglosada(utc(2022, 5, 15), utc(2023, 5, 15))).toEqual({
      anos: 1,
      meses: 0,
      dias: 0,
      etapa: "Lactante mayor",
      textoFormateado: "1 año",
    });
  });
});

describe("calcularEdadDesglosada — años bisiestos", () => {
  it("nacido 29-feb-2020 → 28-feb-2021 es 1 año (año no bisiesto)", () => {
    const resultado = calcularEdadDesglosada(utc(2020, 1, 29), utc(2021, 1, 28));
    expect(resultado).toEqual({
      anos: 1,
      meses: 0,
      dias: 0,
      etapa: "Lactante mayor",
      textoFormateado: "1 año",
    });
  });

  it("nacido 29-feb-2020 → 28-feb-2024 es 3 años 11 meses 30 días (un día antes de cumplir 4 en año bisiesto)", () => {
    const resultado = calcularEdadDesglosada(utc(2020, 1, 29), utc(2024, 1, 28));
    expect(resultado).toEqual({
      anos: 3,
      meses: 11,
      dias: 30,
      etapa: "Preescolar",
      textoFormateado: "3 años 11 meses",
    });
  });

  it("nacido 29-feb-2020 → 29-feb-2024 (día bisiesto) es 4 años", () => {
    const resultado = calcularEdadDesglosada(utc(2020, 1, 29), utc(2024, 1, 29));
    expect(resultado).toEqual({
      anos: 4,
      meses: 0,
      dias: 0,
      etapa: "Preescolar",
      textoFormateado: "4 años",
    });
  });

  it("29-feb-2020 → 1-mar-2021 es 1 año 1 día", () => {
    const resultado = calcularEdadDesglosada(utc(2020, 1, 29), utc(2021, 2, 1));
    expect(resultado).toEqual({
      anos: 1,
      meses: 0,
      dias: 1,
      etapa: "Lactante mayor",
      textoFormateado: "1 año",
    });
  });
});

describe("calcularEdadDesglosada — fin de mes", () => {
  it("31-ene-2023 → 1-mar-2023 es 1 mes 1 día", () => {
    expect(calcularEdadDesglosada(utc(2023, 0, 31), utc(2023, 2, 1))).toEqual({
      anos: 0,
      meses: 1,
      dias: 1,
      etapa: "Lactante menor",
      textoFormateado: "1 mes 1 día",
    });
  });

  it("31-ene-2023 → 28-feb-2023 es 1 mes exacto", () => {
    expect(calcularEdadDesglosada(utc(2023, 0, 31), utc(2023, 1, 28))).toEqual({
      anos: 0,
      meses: 1,
      dias: 0,
      etapa: "Lactante menor",
      textoFormateado: "1 mes",
    });
  });

  it("31-mar-2023 → 30-abr-2023 es 1 mes (clamp a fin de mes)", () => {
    expect(calcularEdadDesglosada(utc(2023, 2, 31), utc(2023, 3, 30))).toEqual({
      anos: 0,
      meses: 1,
      dias: 0,
      etapa: "Lactante menor",
      textoFormateado: "1 mes",
    });
  });

  it("31-mar-2023 → 1-may-2023 es 1 mes 1 día", () => {
    expect(calcularEdadDesglosada(utc(2023, 2, 31), utc(2023, 4, 1))).toEqual({
      anos: 0,
      meses: 1,
      dias: 1,
      etapa: "Lactante menor",
      textoFormateado: "1 mes 1 día",
    });
  });

  it("30-nov-2023 → 31-dic-2023 es 1 mes 1 día", () => {
    expect(calcularEdadDesglosada(utc(2023, 10, 30), utc(2023, 11, 31))).toEqual({
      anos: 0,
      meses: 1,
      dias: 1,
      etapa: "Lactante menor",
      textoFormateado: "1 mes 1 día",
    });
  });
});

describe("calcularEdadDesglosada — etapas clínicas", () => {
  const casos: Array<{
    nombre: string;
    nacimiento: Date;
    referencia: Date;
    etapa: string;
  }> = [
    {
      nombre: "Neonato: 27 días",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2023, 0, 28),
      etapa: "Neonato",
    },
    {
      nombre: "Lactante menor: 28 días (frontera neonato)",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2023, 0, 29),
      etapa: "Lactante menor",
    },
    {
      nombre: "Lactante menor: 11 meses",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2023, 11, 1),
      etapa: "Lactante menor",
    },
    {
      nombre: "Lactante mayor: 12 meses",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2024, 0, 1),
      etapa: "Lactante mayor",
    },
    {
      nombre: "Lactante mayor: 23 meses",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2024, 11, 1),
      etapa: "Lactante mayor",
    },
    {
      nombre: "Preescolar: 2 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2025, 0, 1),
      etapa: "Preescolar",
    },
    {
      nombre: "Preescolar: 5 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2028, 0, 1),
      etapa: "Preescolar",
    },
    {
      nombre: "Escolar: 6 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2029, 0, 1),
      etapa: "Escolar",
    },
    {
      nombre: "Escolar: 11 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2034, 0, 1),
      etapa: "Escolar",
    },
    {
      nombre: "Adolescente: 12 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2035, 0, 1),
      etapa: "Adolescente",
    },
    {
      nombre: "Adolescente: 17 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2040, 0, 1),
      etapa: "Adolescente",
    },
    {
      nombre: "Adulto: 18 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2041, 0, 1),
      etapa: "Adulto",
    },
    {
      nombre: "Adulto: 59 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2082, 0, 1),
      etapa: "Adulto",
    },
    {
      nombre: "Adulto mayor: 60 años",
      nacimiento: utc(2023, 0, 1),
      referencia: utc(2083, 0, 1),
      etapa: "Adulto mayor",
    },
  ];

  it.each(casos)("$nombre", ({ nacimiento, referencia, etapa }) => {
    expect(calcularEdadDesglosada(nacimiento, referencia)?.etapa).toBe(etapa);
  });
});

describe("calcularEdadDesglosada — formato singular/plural", () => {
  it("1 día (singular)", () => {
    expect(calcularEdadDesglosada(utc(2023, 0, 1), utc(2023, 0, 2))?.textoFormateado).toBe("1 día");
  });

  it("1 mes (singular)", () => {
    expect(calcularEdadDesglosada(utc(2023, 0, 1), utc(2023, 1, 1))?.textoFormateado).toBe("1 mes");
  });

  it("1 año (singular)", () => {
    expect(calcularEdadDesglosada(utc(2022, 0, 1), utc(2023, 0, 1))?.textoFormateado).toBe("1 año");
  });

  it("1 año 1 mes (ambos singulares)", () => {
    expect(calcularEdadDesglosada(utc(2022, 0, 1), utc(2023, 1, 1))?.textoFormateado).toBe("1 año 1 mes");
  });

  it("2 días (plural)", () => {
    expect(calcularEdadDesglosada(utc(2023, 0, 1), utc(2023, 0, 3))?.textoFormateado).toBe("2 días");
  });
});

describe("calcularEdadDesglosada — casos inválidos", () => {
  it("fecha futura retorna null", () => {
    expect(calcularEdadDesglosada(utc(2024, 0, 1), utc(2023, 0, 1))).toBeNull();
  });

  it("fecha de nacimiento inválida retorna null", () => {
    expect(calcularEdadDesglosada(new Date("no es una fecha"), utc(2023, 0, 1))).toBeNull();
  });

  it("fecha de referencia inválida retorna null", () => {
    expect(calcularEdadDesglosada(utc(2023, 0, 1), new Date("invalida"))).toBeNull();
  });

  it("fecha de nacimiento en el futuro retorna null", () => {
    expect(calcularEdadDesglosada(utc(2030, 0, 1))).toBeNull();
  });
});

describe("calcularEdadDesglosada — fecha de referencia por defecto", () => {
  it("usa hoy cuando no se pasa fecha de referencia", () => {
    const nacimiento = utc(2000, 0, 1);
    const resultado = calcularEdadDesglosada(nacimiento);
    expect(resultado).not.toBeNull();
    expect(resultado!.anos).toBe(new Date().getUTCFullYear() - 2000);
  });
});
