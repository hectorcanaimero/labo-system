import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { ExamenesTable } from "./components/ExamenesTable";
import { PacienteInfo } from "./components/PacienteInfo";
import { PDFFooter } from "./components/PDFFooter";
import { PDFHeader } from "./components/PDFHeader";

export interface ResultadoPDFProps {
  data: ResultadoPDFData;
}

/** Structural view of resultados.getForPDF, kept independent from the DB package (ADR-08). */
export interface ResultadoPDFData {
  estado: string;
  fecha_muestra: Date;
  fecha_resultado: Date | null;
  medico_solicitante: string | null;
  observaciones: string | null;
  paciente: {
    nombre: string;
    apellido: string;
    cedula: string;
    fecha_nacimiento: Date;
    sexo: "M" | "F" | "O" | null;
  };
  examenes: Array<{
    id: string;
    nombre_snap: string;
    unidad_snap: string | null;
    valores_referencia_snap: string | null;
    valor: string;
    observacion: string | null;
  }>;
  config: {
    nombre: string;
    direccion: string;
    rif: string | null;
    logo_url: string | null;
    firma_url: string | null;
    sello_url: string | null;
    pdf_pie_pagina: string | null;
  } | null;
}

const FALLBACK_LAB_NAME = "Laboratorio clínico";

const styles = StyleSheet.create({
  page: {
    color: "#0f172a",
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingBottom: 54,
    paddingHorizontal: 36,
    paddingTop: 30,
  },
  metadata: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 0.5,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 7,
  },
  metadataText: {
    color: "#475569",
    fontSize: 8,
  },
  notes: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 3,
    borderWidth: 0.5,
    marginBottom: 10,
    padding: 8,
  },
  notesLabel: {
    color: "#475569",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  notesText: {
    fontSize: 8.5,
    lineHeight: 1.3,
  },
});

function formatDate(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${value.getUTCFullYear()}`;
}

function ageAt(birthDate: Date, referenceDate: Date): number {
  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    referenceDate.getUTCMonth() < birthDate.getUTCMonth() ||
    (referenceDate.getUTCMonth() === birthDate.getUTCMonth() &&
      referenceDate.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

export function ResultadoPDF({ data }: ResultadoPDFProps) {
  const config = data.config;
  const laboratoryName = config?.nombre.trim() || FALLBACK_LAB_NAME;
  const rows = data.examenes.map((examen) => ({
    id: examen.id,
    nombre: examen.nombre_snap,
    observacion: examen.observacion,
    referencia: examen.valores_referencia_snap,
    unidad: examen.unidad_snap,
    valor: examen.valor,
  }));

  return (
    <Document
      author={laboratoryName}
      subject="Informe de resultados de laboratorio"
      title={`Resultado - ${data.paciente.nombre} ${data.paciente.apellido}`}
    >
      <Page size="A4" style={styles.page}>
        <PDFHeader
          direccion={config?.direccion ?? ""}
          logo={config?.logo_url ?? null}
          nombre={laboratoryName}
          rif={config?.rif ?? null}
        />
        <PacienteInfo
          edad={ageAt(data.paciente.fecha_nacimiento, data.fecha_muestra)}
          fecha={formatDate(data.fecha_muestra)}
          paciente={data.paciente}
        />
        <View style={styles.metadata}>
          <Text style={styles.metadataText}>Estado: {data.estado}</Text>
          {data.medico_solicitante ? (
            <Text style={styles.metadataText}>Médico: {data.medico_solicitante}</Text>
          ) : null}
          {data.fecha_resultado ? (
            <Text style={styles.metadataText}>Fecha de resultado: {formatDate(data.fecha_resultado)}</Text>
          ) : null}
        </View>
        <ExamenesTable rows={rows} />
        {data.observaciones ? (
          <View wrap={false} style={styles.notes}>
            <Text style={styles.notesLabel}>Observaciones generales</Text>
            <Text style={styles.notesText}>{data.observaciones}</Text>
          </View>
        ) : null}
        <PDFFooter
          firma={config?.firma_url ?? null}
          pieDePagina={config?.pdf_pie_pagina ?? null}
          sello={config?.sello_url ?? null}
        />
      </Page>
    </Document>
  );
}

export default ResultadoPDF;
