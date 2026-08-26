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
    marginBottom: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    borderRadius: 4,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  rowOdd: {
    backgroundColor: "#E6E6E6",
  },
  rowEven: {
    backgroundColor: "#DCDCDC",
  },
  field: {
    flex: 1,
    paddingRight: 8,
  },
  label: {
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  value: {
    color: "#0f172a",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
});

const SEX_LABELS: Record<NonNullable<PacienteInfoData["sexo"]>, string> = {
  F: "Femenino",
  M: "Masculino",
  O: "Otro",
};

function getEtapaClinica(edad: number): string {
  if (edad < 1) return "Lactante"; // Or Neonatal
  if (edad < 12) return "Pediátrico";
  if (edad < 18) return "Adolescente";
  if (edad < 60) return "Adulto";
  return "Tercera Edad";
}

export function PacienteInfo({ paciente, edad, fecha }: PacienteInfoProps) {
  const etapaClinica = getEtapaClinica(edad);
  const edadDisplay = edad === 0 ? "Menor a 1 año" : `${edad} años`;
  
  return (
    <View style={styles.container}>
      <View style={[styles.row, styles.rowEven]}>
        <View style={[styles.field, { flex: 2 }]}>
          <Text style={styles.label}>Paciente</Text>
          <Text style={styles.value}>{paciente.nombre} {paciente.apellido}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Cédula</Text>
          <Text style={styles.value}>{paciente.cedula}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Sexo</Text>
          <Text style={styles.value}>{paciente.sexo ? SEX_LABELS[paciente.sexo] : "No indicado"}</Text>
        </View>
      </View>
      <View style={[styles.row, styles.rowOdd]}>
        <View style={[styles.field, { flex: 2 }]}>
          <Text style={styles.label}>Edad / Etapa Clínica</Text>
          <Text style={styles.value}>{edadDisplay} ({etapaClinica})</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Fecha de Muestra</Text>
          <Text style={styles.value}>{fecha}</Text>
        </View>
        <View style={styles.field}>
          {/* Placeholder for alignment if needed, or something else */}
        </View>
      </View>
    </View>
  );
}
