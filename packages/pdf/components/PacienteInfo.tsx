import { StyleSheet, Text, View } from "@react-pdf/renderer";

import { PDF_COLORS, PDF_FONT } from "../theme";

export interface PacienteInfoData {
  nombre: string;
  apellido: string;
  cedula: string;
  sexo: "M" | "F" | "O" | null;
}

export interface PacienteInfoProps {
  paciente: PacienteInfoData;
  edad: number;
  /** Fecha de toma de muestra, ya formateada. */
  fecha: string;
  /** Fecha de emisión del resultado, ya formateada, o null. */
  fechaResultado?: string | null;
  medico?: string | null;
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 3,
    marginBottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "25%",
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  cellWide: {
    width: "50%",
  },
  cellTop: {
    borderBottomColor: PDF_COLORS.border,
    borderBottomWidth: 1,
  },
  label: {
    color: PDF_COLORS.muted,
    fontSize: 6.5,
    letterSpacing: 0.3,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  value: {
    color: PDF_COLORS.ink,
    fontFamily: PDF_FONT.bold,
    fontSize: 9,
  },
  valueLarge: {
    fontSize: 10.5,
  },
});

const SEX_LABELS: Record<NonNullable<PacienteInfoData["sexo"]>, string> = {
  F: "Femenino",
  M: "Masculino",
  O: "Otro",
};

export function getEtapaClinica(edad: number): string {
  if (edad < 1) return "Lactante";
  if (edad < 12) return "Pediátrico";
  if (edad < 18) return "Adolescente";
  if (edad < 60) return "Adulto";
  return "Adulto mayor";
}

interface FieldProps {
  label: string;
  value: string;
  wide?: boolean;
  top?: boolean;
  large?: boolean;
}

function Field({ label, value, wide, top, large }: FieldProps) {
  return (
    <View style={[styles.cell, wide ? styles.cellWide : {}, top ? styles.cellTop : {}]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, large ? styles.valueLarge : {}]}>{value}</Text>
    </View>
  );
}

/** Ficha del paciente: dos filas de cuatro columnas, con el nombre destacado. */
export function PacienteInfo({ paciente, edad, fecha, fechaResultado, medico }: PacienteInfoProps) {
  const edadDisplay = edad === 0 ? "Menor de 1 año" : `${edad} años`;
  return (
    <View style={styles.container}>
      <Field
        label="Paciente"
        value={`${paciente.nombre} ${paciente.apellido}`.trim()}
        wide
        top
        large
      />
      <Field label="Cédula" value={paciente.cedula} top />
      <Field label="Sexo" value={paciente.sexo ? SEX_LABELS[paciente.sexo] : "No indicado"} top />
      <Field label="Edad" value={`${edadDisplay} · ${getEtapaClinica(edad)}`} />
      <Field label="Fecha de muestra" value={fecha} />
      <Field label="Fecha de resultado" value={fechaResultado ?? "—"} />
      <Field label="Médico solicitante" value={medico?.trim() || "—"} />
    </View>
  );
}
