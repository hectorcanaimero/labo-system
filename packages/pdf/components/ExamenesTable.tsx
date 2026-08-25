import { StyleSheet, Text, View } from "@react-pdf/renderer";

export interface ExamenTableRow {
  id: string;
  nombre: string;
  valor: string;
  unidad: string | null;
  referencia: string | null;
  observacion: string | null;
}

export interface ExamenesTableProps {
  rows: readonly ExamenTableRow[];
}

const styles = StyleSheet.create({
  table: {
    marginBottom: 16,
  },
  header: {
    backgroundColor: "#155e75",
    color: "#ffffff",
    flexDirection: "row",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  row: {
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 0.5,
    color: "#1e293b",
    flexDirection: "row",
    fontSize: 8.5,
    paddingHorizontal: 7,
    paddingVertical: 7,
  },
  alternateRow: {
    backgroundColor: "#f8fafc",
  },
  testColumn: {
    paddingRight: 6,
    width: "31%",
  },
  resultColumn: {
    fontFamily: "Helvetica-Bold",
    paddingRight: 6,
    width: "18%",
  },
  unitColumn: {
    paddingRight: 6,
    width: "15%",
  },
  referenceColumn: {
    paddingRight: 6,
    width: "21%",
  },
  observationColumn: {
    width: "15%",
  },
  empty: {
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 0.5,
    color: "#64748b",
    fontSize: 9,
    padding: 14,
    textAlign: "center",
  },
});

export function ExamenesTable({ rows }: ExamenesTableProps) {
  return (
    <View style={styles.table}>
      <View fixed style={styles.header}>
        <Text style={styles.testColumn}>Examen</Text>
        <Text style={styles.resultColumn}>Resultado</Text>
        <Text style={styles.unitColumn}>Unidad</Text>
        <Text style={styles.referenceColumn}>Referencia</Text>
        <Text style={styles.observationColumn}>Observación</Text>
      </View>
      {rows.length === 0 ? <Text style={styles.empty}>Sin exámenes registrados</Text> : null}
      {rows.map((row, index) => (
        <View
          key={row.id}
          wrap={false}
          style={[styles.row, ...(index % 2 === 1 ? [styles.alternateRow] : [])]}
        >
          <Text style={styles.testColumn}>{row.nombre}</Text>
          <Text style={styles.resultColumn}>{row.valor}</Text>
          <Text style={styles.unitColumn}>{row.unidad ?? "—"}</Text>
          <Text style={styles.referenceColumn}>{row.referencia ?? "—"}</Text>
          <Text style={styles.observationColumn}>{row.observacion ?? "—"}</Text>
        </View>
      ))}
    </View>
  );
}
