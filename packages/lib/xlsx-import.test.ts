import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";

import { parseExamenesXlsx } from "./xlsx-import";

function buildXlsx(rows: Record<string, unknown>[]): Buffer {
  const sheet = utils.json_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Catálogo");
  return write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseExamenesXlsx", () => {
  it("mapea columnas de Tipo de Análisis y Método", () => {
    const buffer = buildXlsx([
      {
        Título: "Hematología",
        Examen: "Hemograma Completo",
        Precio: 15,
        "Tipo de Análisis": "  Hematología  ",
        Método: "  Impedancia eléctrica  ",
      },
    ]);

    const result = parseExamenesXlsx(buffer);

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.tipo_analisis).toBe("Hematología");
    expect(result.valid[0]!.metodo).toBe("Impedancia eléctrica");
  });

  it("procesa archivos sin columnas de Tipo de Análisis y Método", () => {
    const buffer = buildXlsx([
      {
        Título: "Química Sanguínea",
        Examen: "Glucosa en Ayunas",
        Precio: 5.5,
        Unidad: "mg/dL",
        "Valores de Referencia": "70 - 100 mg/dL",
      },
    ]);

    const result = parseExamenesXlsx(buffer);

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.tipo_analisis).toBeUndefined();
    expect(result.valid[0]!.metodo).toBeUndefined();
  });

  it("reconoce encabezados sin tildes (Tipo de Analisis y Metodo)", () => {
    const buffer = buildXlsx([
      {
        Titulo: "Hematología",
        Examen: "Hemograma Completo",
        Precio: 15,
        "Tipo de Analisis": "Hematología",
        Metodo: "Impedancia eléctrica",
      },
    ]);

    const result = parseExamenesXlsx(buffer);

    expect(result.errors).toHaveLength(0);
    expect(result.valid[0]!.tipo_analisis).toBe("Hematología");
    expect(result.valid[0]!.metodo).toBe("Impedancia eléctrica");
  });

  it("deja tipo_analisis y metodo en undefined cuando las celdas están vacías", () => {
    const buffer = buildXlsx([
      {
        Título: "Hematología",
        Examen: "Hemograma Completo",
        Precio: 15,
        "Tipo de Análisis": "",
        Método: "",
      },
    ]);

    const result = parseExamenesXlsx(buffer);

    expect(result.errors).toHaveLength(0);
    expect(result.valid[0]!.tipo_analisis).toBeUndefined();
    expect(result.valid[0]!.metodo).toBeUndefined();
  });
});
