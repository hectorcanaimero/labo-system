import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { ExamenesTable, type ExamenTableRow } from "./components/ExamenesTable";
import { PacienteInfo } from "./components/PacienteInfo";
import { PDFFirma } from "./components/PDFFirma";
import { PDFFooter } from "./components/PDFFooter";
import { PDFHeader } from "./components/PDFHeader";
import { PDF_COLORS, PDF_FONT, PDF_PAGE, formatDateDMY, type LaboratorioPDFConfig } from "./theme";

export interface ResultadoPDFProps {
  data: ResultadoPDFData;
}

/** Structural view of ordenes.getForPDF, kept independent from the DB package (ADR-08). */
export interface ExamenPDFRow {
  id: string;
  nombre_snap: string;
  unidad_snap: string | null;
  valores_referencia_snap: string | null;
  tipo_analisis_snap: string | null;
  metodo_snap: string | null;
  valor: string;
  observacion: string | null;
  /** Grupo (examenes_titulos) del catálogo; null → cae en el grupo residual. */
  titulo: string | null;
}

export interface ResultadoPDFData {
  /** Id de la orden; se imprime abreviado como referencia del informe. */
  id?: string;
  estado: string;
  fecha_muestra: Date | string;
  fecha_resultado: Date | string | null;
  medico_solicitante: string | null;
  observaciones: string | null;
  paciente: {
    nombre: string;
    apellido: string;
    cedula: string;
    fecha_nacimiento: Date | string;
    sexo: "M" | "F" | "O" | null;
  };
  examenes: ExamenPDFRow[];
  config: LaboratorioPDFConfig | null;
}

/** Grupo residual para líneas cuyo examen ya no existe en el catálogo (sin título). */
export const GRUPO_RESIDUAL = "Otros exámenes";

/** Sub-sección de un grupo: un Tipo de Análisis, o las filas directas (tipo null). */
export interface ExamenSeccion {
  tipo: string | null;
  examenes: ExamenPDFRow[];
}

export interface ExamenGrupo {
  titulo: string;
  secciones: ExamenSeccion[];
}

/**
 * Agrupación jerárquica y determinista del informe:
 * - Grupos (Título) en orden de primera aparición; el grupo residual queda SIEMPRE último.
 * - Dentro de cada grupo, las filas sin tipo_analisis van directo bajo el título (primero),
 *   luego una sección por Tipo de Análisis en orden de primera aparición.
 * - El orden de las filas dentro de cada sección respeta el orden de entrada
 *   (la SQL entrega orden ASC, id ASC).
 */
export function agruparExamenes(examenes: readonly ExamenPDFRow[]): ExamenGrupo[] {
  const gruposOrdenados: ExamenGrupo[] = [];
  const grupoPorTitulo = new Map<string, ExamenGrupo>();
  let residual: ExamenGrupo | null = null;

  for (const examen of examenes) {
    const titulo = examen.titulo?.trim();
    const esResidual = !titulo;
    const claveTitulo = titulo || GRUPO_RESIDUAL;

    let grupo = grupoPorTitulo.get(claveTitulo);
    if (!grupo) {
      grupo = { titulo: claveTitulo, secciones: [] };
      grupoPorTitulo.set(claveTitulo, grupo);
      if (esResidual) residual = grupo;
      else gruposOrdenados.push(grupo);
    }

    const tipo = examen.tipo_analisis_snap?.trim() || null;
    let seccion = grupo.secciones.find((s) => s.tipo === tipo);
    if (!seccion) {
      seccion = { tipo, examenes: [] };
      if (tipo === null) grupo.secciones.unshift(seccion);
      else grupo.secciones.push(seccion);
    }
    seccion.examenes.push(examen);
  }

  return residual ? [...gruposOrdenados, residual] : gruposOrdenados;
}

function toExamenesTableRow(examen: ExamenPDFRow): ExamenTableRow {
  return {
    id: examen.id,
    nombre: examen.nombre_snap,
    observacion: examen.observacion,
    referencia: examen.valores_referencia_snap,
    unidad: examen.unidad_snap,
    valor: examen.valor,
    metodo: examen.metodo_snap,
  };
}

const FALLBACK_LAB_NAME = "Laboratorio clínico";

export const AVISO_RESULTADO =
  "Los resultados de este informe deben ser interpretados por el médico tratante en el contexto clínico del paciente. " +
  "Documento confidencial, de uso exclusivo para fines médicos.";

const styles = StyleSheet.create({
  page: {
    color: PDF_COLORS.text,
    fontFamily: PDF_FONT.regular,
    fontSize: 9,
    paddingTop: PDF_PAGE.paddingTop,
    paddingHorizontal: PDF_PAGE.paddingHorizontal,
    paddingBottom: PDF_PAGE.paddingBottom,
  },
  groupTitle: {
    backgroundColor: PDF_COLORS.brandTint,
    borderLeftColor: PDF_COLORS.brand,
    borderLeftWidth: 3,
    color: PDF_COLORS.brandDark,
    fontFamily: PDF_FONT.bold,
    fontSize: 9.5,
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: "uppercase",
  },
  tipoSubtitle: {
    color: PDF_COLORS.muted,
    fontFamily: PDF_FONT.bold,
    fontSize: 8,
    letterSpacing: 0.3,
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 6,
    textTransform: "uppercase",
  },
  notes: {
    borderColor: PDF_COLORS.border,
    borderRadius: 3,
    borderWidth: 1,
    marginTop: 8,
    padding: 8,
  },
  notesLabel: {
    color: PDF_COLORS.brandDark,
    fontFamily: PDF_FONT.bold,
    fontSize: 7,
    letterSpacing: 0.3,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  notesText: {
    fontSize: 8.5,
    lineHeight: 1.35,
  },
});

function ageAt(birthDate: Date | string, referenceDate: Date | string): number {
  const b = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const r = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  let age = r.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    r.getUTCMonth() < b.getUTCMonth() ||
    (r.getUTCMonth() === b.getUTCMonth() && r.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

function referencia(id: string | undefined): string | null {
  if (!id) return null;
  return id.split("-")[0]?.toUpperCase() ?? null;
}

/**
 * Informe de resultados. Cabecera y pie fijos en todas las páginas; el bloque
 * de firma y sello (de la configuración) cierra el documento en la última.
 */
export function ResultadoPDF({ data }: ResultadoPDFProps) {
  const config = data.config;
  const laboratoryName = config?.nombre.trim() || FALLBACK_LAB_NAME;
  const grupos = agruparExamenes(data.examenes);
  const ref = referencia(data.id);
  const fechaEmision = formatDateDMY(data.fecha_resultado ?? new Date());

  const meta = [
    ...(ref ? [{ label: "Nº", value: ref }] : []),
    { label: "Fecha", value: formatDateDMY(data.fecha_muestra) },
  ];

  return (
    <Document
      author={laboratoryName}
      subject="Informe de resultados de laboratorio"
      title={`Resultados - ${data.paciente.nombre} ${data.paciente.apellido}`}
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
          titulo="Informe de resultados"
          meta={meta}
        />

        <PacienteInfo
          edad={ageAt(data.paciente.fecha_nacimiento, data.fecha_muestra)}
          fecha={formatDateDMY(data.fecha_muestra)}
          fechaResultado={data.fecha_resultado ? formatDateDMY(data.fecha_resultado) : null}
          medico={data.medico_solicitante}
          paciente={data.paciente}
        />

        {grupos.map((grupo) => (
          <View key={grupo.titulo}>
            <Text minPresenceAhead={60} style={styles.groupTitle}>
              {grupo.titulo}
            </Text>
            {grupo.secciones.map((seccion) => (
              <View key={seccion.tipo ?? "__directas__"}>
                {seccion.tipo ? (
                  <Text minPresenceAhead={40} style={styles.tipoSubtitle}>
                    {seccion.tipo}
                  </Text>
                ) : null}
                <ExamenesTable rows={seccion.examenes.map(toExamenesTableRow)} />
              </View>
            ))}
          </View>
        ))}

        {data.observaciones?.trim() ? (
          <View wrap={false} style={styles.notes}>
            <Text style={styles.notesLabel}>Observaciones</Text>
            <Text style={styles.notesText}>{data.observaciones.trim()}</Text>
          </View>
        ) : null}

        <PDFFirma
          firma={config?.firma_url ?? null}
          sello={config?.sello_url ?? null}
          nombre={laboratoryName}
          colegioBioanalistas={config?.colegio_bioanalistas ?? null}
          mpps={config?.mpps ?? null}
        />

        <PDFFooter
          aviso={AVISO_RESULTADO}
          emision={`Emitido el ${fechaEmision}`}
          pieDePagina={config?.pdf_pie_pagina ?? null}
        />
      </Page>
    </Document>
  );
}

export default ResultadoPDF;
