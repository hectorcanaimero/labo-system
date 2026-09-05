import { StyleSheet, Text, View } from "@react-pdf/renderer";

import { PDF_COLORS, PDF_FONT } from "../theme";

export interface ExamenTableRow {
  id: string;
  nombre: string;
  valor: string;
  unidad: string | null;
  referencia: string | null;
  metodo: string | null;
  observacion: string | null;
}

export interface ExamenesTableProps {
  rows: readonly ExamenTableRow[];
  /** Si es false, se omite la fila de cabecera (para tablas encadenadas). */
  header?: boolean;
}

const COL = {
  prueba: "30%",
  resultado: "16%",
  unidad: "12%",
  referencia: "24%",
  metodo: "18%",
} as const;

const styles = StyleSheet.create({
  table: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomColor: PDF_COLORS.brand,
    borderBottomWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  headerCell: {
    color: PDF_COLORS.brandDark,
    fontFamily: PDF_FONT.bold,
    fontSize: 7,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomColor: PDF_COLORS.border,
    borderBottomWidth: 0.6,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  rowZebra: {
    backgroundColor: PDF_COLORS.zebra,
  },
  cell: {
    color: PDF_COLORS.text,
    fontSize: 8.5,
    paddingRight: 6,
  },
  prueba: { width: COL.prueba },
  resultado: {
    width: COL.resultado,
    fontFamily: PDF_FONT.bold,
    color: PDF_COLORS.ink,
  },
  unidad: { width: COL.unidad, color: PDF_COLORS.muted },
  referencia: { width: COL.referencia, color: PDF_COLORS.muted },
  metodo: { width: COL.metodo, color: PDF_COLORS.muted, fontSize: 7.5 },
  observacion: {
    color: PDF_COLORS.muted,
    fontFamily: PDF_FONT.italic,
    fontSize: 7.5,
    marginTop: 2,
  },
  empty: {
    color: PDF_COLORS.muted,
    fontSize: 8.5,
    padding: 10,
    textAlign: "center",
  },
});

/**
 * Tabla de exámenes. Cada fila es indivisible (`wrap={false}`), pero la tabla
 * sí puede partirse entre páginas. La observación de la línea, si existe, va
 * en cursiva debajo del nombre de la prueba.
 */
export function ExamenesTable({ rows, header = true }: ExamenesTableProps) {
  return (
    <View style={styles.table}>
      {header ? (
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.prueba]}>Prueba</Text>
          <Text style={[styles.headerCell, styles.resultado]}>Resultado</Text>
          <Text style={[styles.headerCell, styles.unidad]}>Unidad</Text>
          <Text style={[styles.headerCell, styles.referencia]}>Valores de referencia</Text>
          <Text style={[styles.headerCell, styles.metodo]}>Método</Text>
        </View>
      ) : null}
      {rows.length === 0 ? <Text style={styles.empty}>Sin exámenes registrados</Text> : null}
      {rows.map((row, index) => (
        <View
          key={row.id}
          wrap={false}
          style={[styles.row, index % 2 === 1 ? styles.rowZebra : {}]}
        >
          <View style={[styles.cell, styles.prueba]}>
            <Text>{row.nombre}</Text>
            {row.observacion?.trim() ? (
              <Text style={styles.observacion}>{row.observacion.trim()}</Text>
            ) : null}
          </View>
          <Text style={[styles.cell, styles.resultado]}>{row.valor.trim() || "—"}</Text>
          <Text style={[styles.cell, styles.unidad]}>{row.unidad ?? "—"}</Text>
          <Text style={[styles.cell, styles.referencia]}>{row.referencia ?? "—"}</Text>
          <Text style={[styles.cell, styles.metodo]}>{row.metodo ?? "—"}</Text>
        </View>
      ))}
    </View>
  );
}
