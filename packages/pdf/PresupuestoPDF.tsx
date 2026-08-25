import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatBs, formatUsd } from "@labo/lib/bs-format";

import { PDFFooter } from "./components/PDFFooter";
import { PDFHeader } from "./components/PDFHeader";

export interface PresupuestoPDFConfig {
  nombre: string;
  direccion: string;
  rif: string | null;
  logo_url: string | null;
  firma_url: string | null;
  sello_url: string | null;
  pdf_pie_pagina: string | null;
}

export interface PresupuestoPDFLinea {
  id: string;
  nombre_snap: string;
  precio_snap: number;
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
    paddingBottom: 54,
    paddingHorizontal: 36,
    paddingTop: 30,
  },
  patient: {
    backgroundColor: "#f0f9ff",
    borderColor: "#bae6fd",
    borderRadius: 3,
    borderWidth: 0.75,
    marginBottom: 14,
    marginTop: 14,
    padding: 10,
  },
  patientLabel: {
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  patientName: {
    color: "#0f172a",
    fontSize: 10,
  },
  patientMeta: {
    color: "#475569",
    fontSize: 8,
    marginTop: 4,
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
  table: {
    marginBottom: 14,
  },
  tableHeader: {
    backgroundColor: "#155e75",
    color: "#ffffff",
    flexDirection: "row",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  tableRow: {
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 0.5,
    flexDirection: "row",
    fontSize: 8.5,
    paddingHorizontal: 7,
    paddingVertical: 7,
  },
  alternateRow: {
    backgroundColor: "#f8fafc",
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
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 0.5,
    color: "#64748b",
    fontSize: 9,
    padding: 14,
    textAlign: "center",
  },
  totals: {
    alignSelf: "flex-end",
    borderTopColor: "#155e75",
    borderTopWidth: 1,
    paddingTop: 7,
    width: "48%",
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
    borderTopColor: "#cbd5e1",
    borderTopWidth: 0.5,
    marginTop: 2,
    paddingTop: 6,
  },
  grandTotalLabel: {
    color: "#164e63",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  grandTotalValue: {
    color: "#164e63",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textAlign: "right",
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
  const subtotalUsd = lines.reduce((sum, line) => sum + line.precio_snap, 0);

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
            <Text style={styles.examColumn}>Examen</Text>
            <Text style={styles.amountColumn}>Precio USD</Text>
            <Text style={styles.amountColumn}>Precio Bs</Text>
          </View>
          {lines.length === 0 ? <Text style={styles.empty}>Sin exámenes registrados</Text> : null}
          {lines.map((line, index) => (
            <View
              key={line.id}
              wrap={false}
              style={[styles.tableRow, ...(index % 2 === 1 ? [styles.alternateRow] : [])]}
            >
              <Text style={styles.examColumn}>{line.nombre_snap}</Text>
              <Text style={styles.amountColumn}>{formatUsd(line.precio_snap)}</Text>
              <Text style={styles.amountColumn}>{formatBs(line.precio_snap * data.tasa_bs)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal USD</Text>
            <Text style={styles.totalValue}>{formatUsd(subtotalUsd)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Descuento ({formatUsd(data.descuento_pct)}%)</Text>
            <Text style={styles.totalValue}>{formatUsd(subtotalUsd * data.descuento_pct / 100)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text style={styles.grandTotalLabel}>Total USD</Text>
            <Text style={styles.grandTotalValue}>{formatUsd(data.total_usd)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total Bs</Text>
            <Text style={styles.grandTotalValue}>{formatBs(data.total_bs)}</Text>
          </View>
        </View>

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
