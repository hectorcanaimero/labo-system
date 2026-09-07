import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatBs, formatUsd } from "@labo/lib/bs-format";
import { formatNumeroPresupuesto } from "@labo/lib/numero-presupuesto";

import { PDFFirma } from "./components/PDFFirma";
import { PDFFooter } from "./components/PDFFooter";
import { PDFHeader } from "./components/PDFHeader";
import {
  PDF_COLORS,
  PDF_FONT,
  PDF_PAGE,
  formatDateDMY,
  formatDateTimeDMY,
  type LaboratorioPDFConfig,
} from "./theme";

export type PresupuestoPDFConfig = LaboratorioPDFConfig;

export interface PresupuestoPDFLinea {
  id: string;
  nombre_snap: string;
  precio_final_snap: number;
  orden: number;
}

/** Structural view of presupuestos.getForPDF, independent from the DB package (ADR-08). */
export interface PresupuestoPDFData {
  id: string;
  numero_correlativo: number;
  paciente_id: string | null;
  paciente_nombre_libre: string | null;
  paciente_nombre: string | null;
  paciente_apellido: string | null;
  descuento_pct: number;
  tasa_bs: number;
  /** Cargo por toma de muestra en USD. Fila propia, no es un examen. */
  toma_muestra_usd?: number;
  /** Cargo por servicio a domicilio en USD. Si es 0 no se imprime. */
  domicilio_usd?: number;
  total_usd: number;
  total_bs: number;
  estado: string;
  created_at: Date | string;
  lineas: PresupuestoPDFLinea[];
  config?: PresupuestoPDFConfig | null;
}

export interface PresupuestoPDFProps {
  data: PresupuestoPDFData;
}

const FALLBACK_LAB_NAME = "Laboratorio clínico";

export const VALIDEZ_PRESUPUESTO = "Presupuesto válido por 24 horas a partir de su emisión.";

export const AVISO_PRESUPUESTO =
  "Los montos en bolívares se calculan con la tasa oficial BCV vigente el día de emisión y pueden variar al momento del pago. " +
  "Este documento no constituye factura.";

const styles = StyleSheet.create({
  page: {
    color: PDF_COLORS.text,
    fontFamily: PDF_FONT.regular,
    fontSize: 9,
    paddingTop: PDF_PAGE.paddingTop,
    paddingHorizontal: PDF_PAGE.paddingHorizontal,
    paddingBottom: PDF_PAGE.paddingBottom,
  },
  info: {
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 3,
    flexDirection: "row",
    marginBottom: 14,
  },
  infoCell: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRightColor: PDF_COLORS.border,
    borderRightWidth: 1,
  },
  infoCellLast: {
    borderRightWidth: 0,
  },
  infoLabel: {
    color: PDF_COLORS.muted,
    fontSize: 6.5,
    letterSpacing: 0.3,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  infoValue: {
    color: PDF_COLORS.ink,
    fontFamily: PDF_FONT.bold,
    fontSize: 9,
  },
  infoValueLarge: {
    fontSize: 10.5,
  },
  infoMeta: {
    color: PDF_COLORS.muted,
    fontSize: 7,
    marginTop: 1,
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
  },
  colNum: { width: "6%", color: PDF_COLORS.muted },
  colExamen: { width: "58%", paddingRight: 8 },
  colUsd: { width: "16%", textAlign: "right" },
  colBs: { width: "20%", textAlign: "right" },
  empty: {
    color: PDF_COLORS.muted,
    fontSize: 8.5,
    padding: 10,
    textAlign: "center",
  },
  totals: {
    alignSelf: "flex-end",
    width: "46%",
    marginTop: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  totalLabel: {
    color: PDF_COLORS.muted,
    fontSize: 8.5,
  },
  totalValue: {
    color: PDF_COLORS.ink,
    fontFamily: PDF_FONT.bold,
    fontSize: 8.5,
  },
  grandTotal: {
    backgroundColor: PDF_COLORS.brandTint,
    borderRadius: 3,
    marginTop: 4,
    paddingVertical: 5,
  },
  grandTotalLabel: {
    color: PDF_COLORS.brandDark,
    fontFamily: PDF_FONT.bold,
    fontSize: 9.5,
  },
  grandTotalValue: {
    color: PDF_COLORS.brandDark,
    fontFamily: PDF_FONT.bold,
    fontSize: 10.5,
  },
  grandTotalBs: {
    color: PDF_COLORS.brandDark,
    fontFamily: PDF_FONT.bold,
    fontSize: 9,
  },
  validity: {
    color: PDF_COLORS.brandDark,
    fontFamily: PDF_FONT.bold,
    fontSize: 8,
    marginTop: 14,
    textAlign: "center",
  },
});

function patientDisplay(data: PresupuestoPDFData): { name: string; meta: string } {
  if (data.paciente_id) {
    const name = [data.paciente_nombre, data.paciente_apellido].filter(Boolean).join(" ");
    return { name: name || "Paciente registrado", meta: "Paciente registrado" };
  }
  return { name: data.paciente_nombre_libre?.trim() || "Paciente", meta: "Paciente no registrado" };
}

/**
 * Presupuesto. Cabecera con logo y número, ficha del solicitante, detalle de
 * exámenes en USD y Bs, totales y cierre con firma y sello de la configuración.
 */
export function PresupuestoPDF({ data }: PresupuestoPDFProps) {
  const config = data.config;
  const laboratoryName = config?.nombre.trim() || FALLBACK_LAB_NAME;
  const patient = patientDisplay(data);
  const lines = [...data.lineas].sort((left, right) => left.orden - right.orden);
  const subtotalUsd = lines.reduce((sum, line) => sum + line.precio_final_snap, 0);
  const numero = formatNumeroPresupuesto(data.numero_correlativo, data.created_at);
  const fecha = formatDateDMY(data.created_at);
  const emision = formatDateTimeDMY(data.created_at);
  const tomaMuestraUsd = data.toma_muestra_usd ?? 0;
  const domicilioUsd = data.domicilio_usd ?? 0;

  return (
    <Document
      author={laboratoryName}
      subject="Presupuesto de laboratorio"
      title={`Presupuesto ${numero} - ${patient.name}`}
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
          meta={[
            { label: "Nº", value: numero },
            { label: "Fecha", value: fecha },
          ]}
        />

        <View style={styles.info}>
          <View style={[styles.infoCell, { flex: 2 }]}>
            <Text style={styles.infoLabel}>Solicitante</Text>
            <Text style={[styles.infoValue, styles.infoValueLarge]}>{patient.name}</Text>
            <Text style={styles.infoMeta}>{patient.meta}</Text>
          </View>
          <View style={[styles.infoCell, { flex: 1 }]}>
            <Text style={styles.infoLabel}>Tasa BCV</Text>
            <Text style={styles.infoValue}>Bs. {formatBs(data.tasa_bs)} por USD</Text>
            <Text style={styles.infoMeta}>del {fecha}</Text>
          </View>
          <View style={[styles.infoCell, styles.infoCellLast, { flex: 1 }]}>
            <Text style={styles.infoLabel}>Estado</Text>
            <Text style={styles.infoValue}>{data.estado}</Text>
          </View>
        </View>

        <View>
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, styles.colNum]}>#</Text>
            <Text style={[styles.headerCell, styles.colExamen]}>Examen</Text>
            <Text style={[styles.headerCell, styles.colUsd]}>Precio USD</Text>
            <Text style={[styles.headerCell, styles.colBs]}>Precio Bs.</Text>
          </View>
          {lines.length === 0 ? <Text style={styles.empty}>Sin exámenes registrados</Text> : null}
          {lines.map((line, index) => (
            <View
              key={line.id}
              wrap={false}
              style={[styles.row, index % 2 === 1 ? styles.rowZebra : {}]}
            >
              <Text style={[styles.cell, styles.colNum]}>{index + 1}</Text>
              <Text style={[styles.cell, styles.colExamen]}>{line.nombre_snap}</Text>
              <Text style={[styles.cell, styles.colUsd]}>{formatUsd(line.precio_final_snap)}</Text>
              <Text style={[styles.cell, styles.colBs]}>
                {formatBs(line.precio_final_snap * data.tasa_bs)}
              </Text>
            </View>
          ))}
        </View>

        <View wrap={false} style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal (USD)</Text>
            <Text style={styles.totalValue}>USD {formatUsd(subtotalUsd)}</Text>
          </View>
          {tomaMuestraUsd > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Toma de muestra</Text>
              <Text style={styles.totalValue}>
                USD {formatUsd(tomaMuestraUsd)} · Bs. {formatBs(tomaMuestraUsd * data.tasa_bs)}
              </Text>
            </View>
          ) : null}
          {domicilioUsd > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Servicio a domicilio</Text>
              <Text style={styles.totalValue}>
                USD {formatUsd(domicilioUsd)} · Bs. {formatBs(domicilioUsd * data.tasa_bs)}
              </Text>
            </View>
          ) : null}
          {data.descuento_pct > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Descuento aplicado</Text>
              <Text style={styles.totalValue}>{data.descuento_pct}% (incluido en los precios)</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text style={styles.grandTotalLabel}>Total a pagar</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.grandTotalValue}>USD {formatUsd(data.total_usd)}</Text>
              <Text style={styles.grandTotalBs}>Bs. {formatBs(data.total_bs)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.validity}>{VALIDEZ_PRESUPUESTO}</Text>

        <PDFFirma
          firma={config?.firma_url ?? null}
          sello={config?.sello_url ?? null}
          nombre={laboratoryName}
          colegioBioanalistas={config?.colegio_bioanalistas ?? null}
          mpps={config?.mpps ?? null}
        />

        <PDFFooter
          aviso={AVISO_PRESUPUESTO}
          emision={`Emitido el ${emision}`}
          pieDePagina={config?.pdf_pie_pagina ?? null}
        />
      </Page>
    </Document>
  );
}

export default PresupuestoPDF;
