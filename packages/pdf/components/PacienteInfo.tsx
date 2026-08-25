import { StyleSheet, Text, View } from "@react-pdf/renderer";

export interface PacienteInfoData {
  nombre: string;
  apellido: string;
  cedula: string;
  sexo: "M" | "F" | "O" | null;
}

export interface PacienteInfoProps {
  paciente: PacienteInfoData;
  edad: number;
  fecha: string;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f0f9ff",
    borderColor: "#bae6fd",
    borderRadius: 3,
    borderWidth: 0.75,
    marginBottom: 16,
    marginTop: 14,
    padding: 10,
  },
  row: {
    flexDirection: "row",
    marginBottom: 5,
  },
  lastRow: {
    flexDirection: "row",
  },
  fieldWide: {
    paddingRight: 12,
    width: "55%",
  },
  fieldNarrow: {
    paddingRight: 12,
    width: "22.5%",
  },
  label: {
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  value: {
    color: "#0f172a",
    fontSize: 9.5,
  },
});

const SEX_LABELS: Record<NonNullable<PacienteInfoData["sexo"]>, string> = {
  F: "Femenino",
  M: "Masculino",
  O: "Otro",
};

export function PacienteInfo({ paciente, edad, fecha }: PacienteInfoProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.fieldWide}>
          <Text style={styles.label}>Paciente</Text>
          <Text style={styles.value}>{paciente.nombre} {paciente.apellido}</Text>
        </View>
        <View style={styles.fieldNarrow}>
          <Text style={styles.label}>Cédula</Text>
          <Text style={styles.value}>{paciente.cedula}</Text>
        </View>
        <View style={styles.fieldNarrow}>
          <Text style={styles.label}>Edad</Text>
          <Text style={styles.value}>{edad} años</Text>
        </View>
      </View>
      <View style={styles.lastRow}>
        <View style={styles.fieldWide}>
          <Text style={styles.label}>Fecha de muestra</Text>
          <Text style={styles.value}>{fecha}</Text>
        </View>
        <View style={styles.fieldNarrow}>
          <Text style={styles.label}>Sexo</Text>
          <Text style={styles.value}>{paciente.sexo ? SEX_LABELS[paciente.sexo] : "No indicado"}</Text>
        </View>
      </View>
    </View>
  );
}
