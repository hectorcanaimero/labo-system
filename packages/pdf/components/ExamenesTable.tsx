import { StyleSheet, Text, View } from "@react-pdf/renderer";

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
}

const styles = StyleSheet.create({
  table: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    borderRadius: 4,
    overflow: "hidden",
  },
  header: {
    backgroundColor: "#0E9090",
    color: "#ffffff",
    flexDirection: "row",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  row: {
    color: "#1e293b",
    flexDirection: "row",
    fontSize: 8.5,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  rowOdd: {
    backgroundColor: "#E6E6E6",
  },
  rowEven: {
    backgroundColor: "#DCDCDC",
  },
  pruebaColumn: {
    paddingRight: 6,
    width: "25%",
  },
  resultadoColumn: {
    fontFamily: "Helvetica-Bold",
    paddingRight: 6,
    width: "15%",
  },
  unidadColumn: {
    paddingRight: 6,
    width: "15%",
  },
  referenciaColumn: {
    paddingRight: 6,
    width: "25%",
  },
  metodoColumn: {
    paddingRight: 6,
    width: "20%",
  },
  empty: {
    color: "#64748b",
    fontSize: 9,
    padding: 14,
    textAlign: "center",
    backgroundColor: "#E6E6E6",
  },
});

export function ExamenesTable({ rows }: ExamenesTableProps) {
  return (
    <View style={styles.table}>
      <View fixed style={styles.header}>
        <Text style={styles.pruebaColumn}>PRUEBA</Text>
        <Text style={styles.resultadoColumn}>RESULTADO</Text>
        <Text style={styles.unidadColumn}>UNIDAD</Text>
        <Text style={styles.referenciaColumn}>VALOR NORMAL</Text>
        <Text style={styles.metodoColumn}>MÉTODO</Text>
      </View>
      {rows.length === 0 ? <Text style={styles.empty}>Sin exámenes registrados</Text> : null}
      {rows.map((row, index) => (
        <View
          key={row.id}
          wrap={false}
          style={[styles.row, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}
        >
          <Text style={styles.pruebaColumn}>{row.nombre}</Text>
          <Text style={styles.resultadoColumn}>{row.valor}</Text>
          <Text style={styles.unidadColumn}>{row.unidad ?? "—"}</Text>
          <Text style={styles.referenciaColumn}>{row.referencia ?? "—"}</Text>
          <Text style={styles.metodoColumn}>{row.metodo ?? "—"}</Text>
        </View>
      ))}
    </View>
  );
}
