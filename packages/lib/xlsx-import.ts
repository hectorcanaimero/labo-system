import { read, utils } from "xlsx";
import { z } from "zod";

export interface ExamenImportRow {
  titulo: string;
  nombre: string;
  precio_usd: number;
  unidad?: string;
  valores_referencia?: string;
  tipo_analisis?: string;
  metodo?: string;
  _rowNumber: number;
}

const RowSchema = z.object({
  titulo: z.string().min(1, "El título no puede estar vacío"),
  nombre: z.string().min(1, "El nombre del examen no puede estar vacío"),
  precio_usd: z.number().min(0, "El precio no puede ser negativo"),
  unidad: z.string().optional(),
  valores_referencia: z.string().optional(),
  tipo_analisis: z.string().optional(),
  metodo: z.string().optional(),
});

export interface ParseResult {
  valid: ExamenImportRow[];
  errors: { row: number; msg: string }[];
}

export function parseExamenesXlsx(buffer: Buffer): ParseResult {
  const result: ParseResult = { valid: [], errors: [] };

  try {
    const workbook = read(buffer, { type: "buffer" });
    if (workbook.SheetNames.length === 0) {
      result.errors.push({ row: 0, msg: "El archivo Excel no tiene hojas" });
      return result;
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName!];

    // Read as JSON, assuming first row is header
    // Using defval: undefined so empty cells are undefined
    const rawRows = utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: undefined });

    rawRows.forEach((row, index) => {
      const rowNumber = index + 2; // +1 for 0-index, +1 for header

      // Normalize keys, expecting: "Título", "Examen", "Precio (USD)", "Unidad", "Valores de Referencia"
      // or similar keys. We'll make it flexible or strict. Let's do flexible mapping based on expected keys or just lowercase.
      
      const getValue = (keys: string[]) => {
        const foundKey = Object.keys(row).find((k) =>
          keys.some((expected) => k.toLowerCase().includes(expected.toLowerCase()))
        );
        return foundKey ? row[foundKey] : undefined;
      };

      const rawTitulo = getValue(["título", "titulo"]);
      const rawNombre = getValue(["examen", "nombre"]);
      const rawPrecio = getValue(["precio"]);
      const rawUnidad = getValue(["unidad"]);
      const rawValores = getValue(["valores", "referencia"]);
      const rawTipoAnalisis = getValue([
        "tipo de análisis",
        "tipo de analisis",
        "tipo análisis",
        "tipo analisis",
        "tipo",
      ]);
      const rawMetodo = getValue(["método", "metodo"]);

      const parsedPrecio = typeof rawPrecio === "number" ? rawPrecio : parseFloat(String(rawPrecio));

      const parsedRow = {
        titulo: typeof rawTitulo === "string" ? rawTitulo.trim() : rawTitulo,
        nombre: typeof rawNombre === "string" ? rawNombre.trim() : rawNombre,
        precio_usd: parsedPrecio,
        unidad: typeof rawUnidad === "string" ? rawUnidad.trim() : undefined,
        valores_referencia: typeof rawValores === "string" ? rawValores.trim() : undefined,
        tipo_analisis:
          typeof rawTipoAnalisis === "string" && rawTipoAnalisis.trim() !== ""
            ? rawTipoAnalisis.trim()
            : undefined,
        metodo:
          typeof rawMetodo === "string" && rawMetodo.trim() !== ""
            ? rawMetodo.trim()
            : undefined,
      };

      const parsed = RowSchema.safeParse(parsedRow);
      if (parsed.success) {
        result.valid.push({
          ...parsed.data,
          _rowNumber: rowNumber,
        });
      } else {
        const messages = parsed.error.issues.map((i) => i.message).join(", ");
        result.errors.push({ row: rowNumber, msg: messages });
      }
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Archivo inválido";
    result.errors.push({ row: 0, msg: `Error leyendo XLSX: ${msg}` });
  }

  return result;
}
