import QRCode from "qrcode";

/**
 * QR como path SVG, para dibujarlo con las primitivas de `@react-pdf/renderer`.
 *
 * `@react-pdf` no sabe renderizar una cadena SVG ni un `data:image/svg+xml`,
 * así que no sirve `QRCode.toString`. Se usa `QRCode.create`, que devuelve la
 * matriz de módulos sin tocar canvas ni el DOM (importante: el PDF se arma en
 * el servidor), y se compone un único `<Path>` con un cuadrado por módulo
 * oscuro. Un solo path en vez de N rects mantiene el PDF liviano.
 */

export interface QrPath {
  /** Atributo `d` del path, en coordenadas de módulo (0..size). */
  d: string;
  /** Lado del QR en módulos. Sirve de `viewBox`. */
  size: number;
}

/**
 * Nivel de corrección de errores. "M" (~15%) es el compromiso habitual para
 * un QR impreso: tolera manchas y dobleces sin agrandar demasiado la matriz.
 */
const NIVEL_CORRECCION = "M" as const;

export function generarQrPath(contenido: string): QrPath {
  const texto = contenido.trim();
  if (texto.length === 0) throw new Error("QR_CONTENIDO_VACIO");

  const { modules } = QRCode.create(texto, { errorCorrectionLevel: NIVEL_CORRECCION });
  const size = modules.size;
  const data = modules.data;

  const partes: string[] = [];
  for (let fila = 0; fila < size; fila += 1) {
    for (let columna = 0; columna < size; columna += 1) {
      if (data[fila * size + columna]) {
        partes.push(`M${columna} ${fila}h1v1h-1z`);
      }
    }
  }

  return { d: partes.join(""), size };
}
