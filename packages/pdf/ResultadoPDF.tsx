import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { ExamenesTable, type ExamenTableRow } from "./components/ExamenesTable";
import { PacienteInfo } from "./components/PacienteInfo";
import { PDFFooter } from "./components/PDFFooter";
import { PDFHeader } from "./components/PDFHeader";

export interface ResultadoPDFProps {
  data: ResultadoPDFData;
}

/** Structural view of resultados.getForPDF, kept independent from the DB package (ADR-08). */
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
  config: {
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
  } | null;
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

const styles = StyleSheet.create({
  page: {
    color: "#0f172a",
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingBottom: 70, // extra space for footer
    paddingHorizontal: 36,
    paddingTop: 30,
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
  groupTitle: {
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 10,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  tipoSubtitle: {
    color: "#475569",
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    marginTop: 6,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  notes: {
    backgroundColor: "#E6E6E6",
    borderColor: "#DCDCDC",
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 10,
    padding: 8,
  },
  notesLabel: {
    color: "#0E9090",
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

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

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

export function ResultadoPDF({ data }: ResultadoPDFProps) {
  const config = data.config;
  const laboratoryName = config?.nombre.trim() || FALLBACK_LAB_NAME;

  // Jerarquía: Título (grupo) -> Tipo de Análisis -> exámenes.
  const grupos = agruparExamenes(data.examenes);

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
          colegioBioanalistas={config?.colegio_bioanalistas ?? null}
          mpps={config?.mpps ?? null}
          telefono={config?.telefono ?? null}
          email={config?.email ?? null}
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

        {grupos.map((grupo) => (
          <View key={grupo.titulo}>
            {grupo.secciones.map((seccion, indiceSeccion) => (
              <View wrap={false} key={seccion.tipo ?? "__directas__"}>
                {indiceSeccion === 0 ? (
                  <Text style={styles.groupTitle}>{grupo.titulo}</Text>
                ) : null}
                {seccion.tipo ? <Text style={styles.tipoSubtitle}>{seccion.tipo}</Text> : null}
                <ExamenesTable rows={seccion.examenes.map(toExamenesTableRow)} />
              </View>
            ))}
          </View>
        ))}

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
