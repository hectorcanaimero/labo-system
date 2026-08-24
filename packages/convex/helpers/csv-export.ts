import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Columna de un export CSV.
 *
 * `key` referencia la propiedad de cada row; `header` es el nombre que
 * aparece en la fila de encabezado. `format` (opcional) transforma el
 * valor crudo a su representación textual (fechas, números, etc.).
 */
export type CsvColumn = {
  key: string;
  header: string;
  format?: (value: unknown) => string;
};

/**
 * MIME type canónico de los CSV exportados.
 *
 * El `charset=utf-8` explícito, junto con el BOM que antepone `writeCsv`,
 * hace que Excel y Google Sheets abran el archivo con el encoding correcto.
 */
const CSV_MIME = "text/csv;charset=utf-8";

/**
 * Serializa un valor crudo a string para el CSV.
 *
 * `null` y `undefined` se exportan como celda vacía (que es la convención
 * de los reportes del laboratorio), el resto usa su representación nativa.
 */
function defaultValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

/**
 * Escapa una celda siguiendo RFC 4180.
 *
 * Si el valor contiene coma, comilla doble, CR o LF, se envuelve entre
 * comillas y se duplican las comillas internas.
 */
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Genera un CSV a partir de rows y una definición de columnas.
 *
 * Antepone UTF-8 BOM (`\uFEFF`) para que Excel detecte el encoding y usa
 * CRLF como separador de líneas (compatibilidad con Excel/Sheets).
 *
 * @example
 * ```ts
 * const csv = writeCsv(rows, [
 *   { key: "nombre", header: "Nombre" },
 *   { key: "total_usd", header: "Total USD", format: (v) => (v as number).toFixed(2) },
 * ]);
 * ```
 */
export function writeCsv(
  rows: Array<Record<string, unknown>>,
  columns: CsvColumn[]
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const raw = row[c.key];
        const value = c.format ? c.format(raw) : defaultValue(raw);
        return escapeCell(value);
      })
      .join(",")
  );

  return "\uFEFF" + [header, ...lines].join("\r\n");
}

/**
 * Deriva el MIME type a partir de la extensión del nombre de archivo.
 *
 * Convex File Storage (`ctx.storage.store`) no persiste el nombre de
 * archivo: el único metadato que viaja con el Blob es su `content-type`.
 * Derivarlo del `filename` mantiene la convención de los callers y deja
 * abierta la puerta a XLSX en Fase 2 sin tocar esta firma.
 */
function mimeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
    default:
      return CSV_MIME;
  }
}

/**
 * Sube un CSV a Convex File Storage y retorna su `storageId`.
 *
 * Requiere ejecutarse dentro de una action (no mutation/query), ya que
 * `ctx.storage.store` sólo está disponible en `ActionCtx`.
 */
export async function uploadCsvToStorage(
  ctx: ActionCtx,
  csv: string,
  filename: string
): Promise<Id<"_storage">> {
  const blob = new Blob([csv], { type: mimeFromFilename(filename) });
  return await ctx.storage.store(blob);
}
