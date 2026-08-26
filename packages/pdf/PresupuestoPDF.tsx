import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatBs, formatUsd } from "@labo/lib/bs-format";

import { PDFFooter } from "./components/PDFFooter";
import { PDFHeader } from "./components/PDFHeader";

export interface PresupuestoPDFConfig {
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

export interface PresupuestoPDFLinea {
  id: string;
  nombre_snap: string;
  precio_final_snap: number;
  orden: number;
}

/** Structural view of presupuestos.getForPDF, independent from the DB package (ADR-08). */
export interface PresupuestoPDFData {
  id: string;
  paciente_id: string | null;
  paciente_nombre_libre: string | null;
  paciente_nombre: string | null;
  paciente_apellido: string | null;
  descuento_pct: number;
  tasa_bs: number;
  total_usd: number;
  total_bs: number;
  estado: string;
  created_at: Date;
  lineas: PresupuestoPDFLinea[];
  config?: PresupuestoPDFConfig | null;
}

export interface PresupuestoPDFProps {
  data: PresupuestoPDFData;
}

const FALLBACK_LAB_NAME = "Laboratorio clínico";

const styles = StyleSheet.create({
  page: {
    color: "#0f172a",
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingBottom: 70, // extra space for footer
    paddingHorizontal: 36,
    paddingTop: 30,
  },
  patient: {
    borderWidth: 1,
    borderColor: "#DCDCDC",
    borderRadius: 4,
    marginBottom: 14,
    marginTop: 4,
    padding: 10,
    backgroundColor: "#E6E6E6",
  },
  patientLabel: {
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  patientName: {
    color: "#0f172a",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  patientMeta: {
    color: "#475569",
    fontSize: 8,
    marginTop: 4,
  },
  metadata: {
    borderBottomColor: "#DCDCDC",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 7,
  },
  metadataText: {
    color: "#475569",
    fontSize: 8,
  },
  table: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeader: {
    backgroundColor: "#0E9090",
    color: "#ffffff",
    flexDirection: "row",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tableRow: {
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
  examColumn: {
    paddingRight: 8,
    width: "56%",
  },
  amountColumn: {
    textAlign: "right",
    width: "22%",
  },
  empty: {
    color: "#64748b",
    fontSize: 9,
    padding: 14,
    textAlign: "center",
    backgroundColor: "#E6E6E6",
  },
  totals: {
    alignSelf: "flex-end",
    borderTopColor: "#0E9090",
    borderTopWidth: 2,
    paddingTop: 8,
    width: "50%",
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  totalLabel: {
    color: "#475569",
    fontSize: 8.5,
  },
  totalValue: {
    color: "#1e293b",
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    textAlign: "right",
  },
  grandTotal: {
    borderTopColor: "#DCDCDC",
    borderTopWidth: 1,
    marginTop: 2,
    paddingTop: 6,
  },
  grandTotalLabel: {
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  grandTotalValue: {
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textAlign: "right",
  },
  validityClause: {
    backgroundColor: "#E6E6E6",
    color: "#0E9090",
    padding: 8,
    borderRadius: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textAlign: "center",
    marginTop: 10,
    textTransform: "uppercase",
  },
});

function formatDate(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${value.getUTCFullYear()}`;
}

function patientDisplay(data: PresupuestoPDFData): { name: string; meta: string | null } {
  if (data.paciente_id) {
    const name = [data.paciente_nombre, data.paciente_apellido].filter(Boolean).join(" ");
    return { name: name || "Paciente registrado", meta: "Paciente registrado" };
  }
  return { name: data.paciente_nombre_libre?.trim() || "Paciente", meta: "Paciente no registrado" };
}

export function PresupuestoPDF({ data }: PresupuestoPDFProps) {
  const config = data.config;
  const laboratoryName = config?.nombre.trim() || FALLBACK_LAB_NAME;
  const patient = patientDisplay(data);
  const lines = [...data.lineas].sort((left, right) => left.orden - right.orden);
  const subtotalUsd = lines.reduce((sum, line) => sum + line.precio_final_snap, 0);

  return (
    <Document
      author={laboratoryName}
      subject="Presupuesto de laboratorio"
      title={`Presupuesto - ${patient.name}`}
    >
      <Page size="A4" style={styles.page}>
        <PDFHeader
          direccion={config?.direccion ?? ""}
          logo={config?.logo_url ?? null}
          nombre={laboratoryName}
          rif={config?.rif ?? null}
          colegioBioanalistas={config?.colegio_bioanalistas ?? null}
          mpps={config?.mpps ?? null}
          telefono={config?.telefono ?? null}
          email={config?.email ?? null}
          titulo="Presupuesto"
        />

        <View style={styles.patient}>
          <Text style={styles.patientLabel}>Paciente</Text>
          <Text style={styles.patientName}>{patient.name}</Text>
          {patient.meta ? <Text style={styles.patientMeta}>{patient.meta}</Text> : null}
        </View>

        <View style={styles.metadata}>
          <Text style={styles.metadataText}>Presupuesto: {data.id}</Text>
          <Text style={styles.metadataText}>Fecha: {formatDate(data.created_at)}</Text>
          <Text style={styles.metadataText}>Estado: {data.estado}</Text>
        </View>

        <View style={styles.table}>
          <View fixed style={styles.tableHeader}>
            <Text style={styles.examColumn}>PRUEBA / EXAMEN</Text>
            <Text style={styles.amountColumn}>PRECIO (USD)</Text>
            <Text style={styles.amountColumn}>PRECIO (Bs)</Text>
          </View>
          {lines.length === 0 ? <Text style={styles.empty}>Sin exámenes registrados</Text> : null}
          {lines.map((line, index) => (
            <View
              key={line.id}
              wrap={false}
              style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}
            >
              <Text style={styles.examColumn}>{line.nombre_snap}</Text>
              <Text style={styles.amountColumn}>{formatUsd(line.precio_final_snap)}</Text>
              <Text style={styles.amountColumn}>{formatBs(line.precio_final_snap * data.tasa_bs)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Suma de exámenes (USD)</Text>
            <Text style={styles.totalValue}>{formatUsd(subtotalUsd)}</Text>
          </View>
          {data.descuento_pct > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Descuento del {data.descuento_pct}%</Text>
              <Text style={styles.totalValue}>incluido en los precios</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text style={styles.grandTotalLabel}>Total a Pagar (USD)</Text>
            <Text style={styles.grandTotalValue}>{formatUsd(data.total_usd)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total a Pagar (Bs)</Text>
            <Text style={styles.grandTotalValue}>{formatBs(data.total_bs)}</Text>
          </View>
        </View>
        
        <Text style={styles.validityClause}>
          Presupuesto válido por 24 horas a partir de su emisión
        </Text>

        <PDFFooter
          firma={config?.firma_url ?? null}
          pieDePagina={config?.pdf_pie_pagina ?? null}
          sello={config?.sello_url ?? null}
        />
      </Page>
    </Document>
  );
}

export default PresupuestoPDF;
