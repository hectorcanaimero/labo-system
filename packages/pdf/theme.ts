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

/** dd/mm/aaaa en UTC (las fechas de negocio se guardan sin hora local). */
export function formatDateDMY(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

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
