import { StyleSheet, Text, View } from "@react-pdf/renderer";

import { PDF_COLORS, PDF_FONT, PDF_PAGE } from "../theme";

export interface PDFFooterProps {
  /** Texto libre de la configuración (`pdf_pie_pagina`). */
  pieDePagina: string | null;
  /** Cláusula legal/aviso del documento. Si es null no se imprime. */
  aviso?: string | null;
  /** Texto a la izquierda del número de página (ej. "Emitido el 05/09/2026"). */
  emision?: string | null;
}

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 18,
    left: PDF_PAGE.paddingHorizontal,
    right: PDF_PAGE.paddingHorizontal,
    borderTopColor: PDF_COLORS.border,
    borderTopWidth: 0.8,
    paddingTop: 6,
  },
  aviso: {
    color: PDF_COLORS.muted,
    fontFamily: PDF_FONT.italic,
    fontSize: 6.5,
    lineHeight: 1.3,
    textAlign: "center",
    marginBottom: 3,
  },
  pie: {
    color: PDF_COLORS.brandDark,
    fontFamily: PDF_FONT.bold,
    fontSize: 7,
    textAlign: "center",
    marginBottom: 3,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  small: {
    color: PDF_COLORS.faint,
    fontSize: 6.5,
  },
});

/** Pie fijo en todas las páginas: aviso, pie configurable, emisión y paginado. */
export function PDFFooter({ pieDePagina, aviso, emision }: PDFFooterProps) {
  return (
    <View fixed style={styles.footer}>
      {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}
      {pieDePagina ? <Text style={styles.pie}>{pieDePagina}</Text> : null}
      <View style={styles.row}>
        <Text style={styles.small}>{emision ?? ""}</Text>
        <Text
          style={styles.small}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </View>
    </View>
  );
}
