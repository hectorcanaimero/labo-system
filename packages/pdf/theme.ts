/**
 * Tokens compartidos por los PDF (@labo/pdf).
 *
 * `@react-pdf/renderer` no usa CSS ni los tokens de la UI web, así que la
 * paleta vive acá. El teal es la identidad del laboratorio en papel; el resto
 * son grises neutros para que logo, firma y sello resalten.
 */
export const PDF_COLORS = {
  brand: "#0E9090",
  brandDark: "#0B6E6E",
  brandTint: "#E6F4F4",
  ink: "#0F172A",
  text: "#1E293B",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#D9E2EC",
  zebra: "#F4F7FA",
  white: "#FFFFFF",
} as const;

export const PDF_FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
} as const;

/** Márgenes de página. El inferior deja lugar al pie fijo. */
export const PDF_PAGE = {
  paddingTop: 28,
  paddingHorizontal: 36,
  paddingBottom: 64,
} as const;

/**
 * `dd/mm/aaaa` y `dd/mm/aaaa hh:mm` en la zona del laboratorio.
 *
 * Reexportados desde `@labo/lib/fecha`: la conversión de zona vive en un solo
 * lugar, compartida con las páginas públicas.
 */
export {
  LAB_TIMEZONE,
  formatFechaLab as formatDateDMY,
  formatFechaHoraLab as formatDateTimeDMY,
} from "@labo/lib/fecha";

export interface LaboratorioPDFConfig {
  nombre: string;
  direccion: string;
  rif: string | null;
  colegio_bioanalistas: string | null;
  mpps: string | null;
  telefono: string | null;
  email: string | null;
  logo_url: string | null;
  firma_url: string | null;
  sello_url: string | null;
  pdf_pie_pagina: string | null;
}

/**
 * Data URI del PNG 1×1 transparente que usan los route handlers cuando un
 * asset no se pudo leer. Se trata como "sin asset" para no dibujar un recuadro
 * vacío ni una línea de firma sobre nada.
 */
const TRANSPARENT_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function assetOrNull(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.endsWith(TRANSPARENT_PNG_B64)) return null;
  return src;
}
