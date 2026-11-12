import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatNumeroOrden } from "@labo/lib/numero-orden";
import { ExamenesTable, type ExamenTableRow } from "./components/ExamenesTable";
import { PacienteInfo } from "./components/PacienteInfo";
import { PDFFirma } from "./components/PDFFirma";
import { PDFQr } from "./components/PDFQr";
import { PDFFooter } from "./components/PDFFooter";
import { PDFHeader } from "./components/PDFHeader";
import { PDF_COLORS, PDF_FONT, PDF_PAGE, formatDateDMY, type LaboratorioPDFConfig } from "./theme";

export interface ResultadoPDFProps {
  data: ResultadoPDFData;
  /**
   * `titulo_id` de un grupo: el informe sale sólo con ese grupo y su
   * observación (para enviárselo al médico que lo lee), sin la observación
   * general. Si el grupo no existe en la orden, sale el informe completo.
   */
  soloGrupo?: string | null;
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
  titulo_id?: string | null;
}

export interface ResultadoPDFData {
  numero_correlativo: number;
  created_at: Date | string;
  estado: string;
  fecha_muestra: Date | string;
  fecha_resultado: Date | string | null;
  medico_solicitante: string | null;
  observaciones: string | null;
  /** Observación de cada grupo, por `titulo_id`. */
  observaciones_grupos?: Record<string, string> | null;
  paciente: {
    nombre: string;
    apellido: string;
    cedula: string;
    fecha_nacimiento: Date | string;
    sexo: "M" | "F" | "O" | null;
  };
  examenes: ExamenPDFRow[];
  config: LaboratorioPDFConfig | null;
  /**
   * URL absoluta de la vista de verificación (`/v/{slug}`). Si falta, el
   * informe se emite sin QR en vez de romperse: un PDF sin recuadro de
   * verificación sigue siendo válido.
   */
  verificacion_url?: string | null;
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
  /** null en el grupo residual (sin título): no admite observación propia. */
  titulo_id: string | null;
  secciones: ExamenSeccion[];
}

/**
 * Agrupación jerárquica y determinista del informe:
 * - Grupos (Título) en orden de primera aparición; el grupo residual queda SIEMPRE último.
 * - Dentro de cada grupo, una sección por cada tramo consecutivo de filas con el mismo
 *   Tipo de Análisis (null = filas directas, sin subtítulo). Las filas nunca se reordenan:
 *   se respeta el orden en que se cargaron (la SQL entrega orden ASC, id ASC), que en
 *   hematología es clínico. Si un tipo reaparece más abajo, abre otra sección.
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
      grupo = { titulo: claveTitulo, titulo_id: esResidual ? null : (examen.titulo_id ?? null), secciones: [] };
      grupoPorTitulo.set(claveTitulo, grupo);
      if (esResidual) residual = grupo;
      else gruposOrdenados.push(grupo);
    }

    const tipo = examen.tipo_analisis_snap?.trim() || null;
    let seccion = grupo.secciones.at(-1);
    if (!seccion || seccion.tipo !== tipo) {
      seccion = { tipo, examenes: [] };
      grupo.secciones.push(seccion);
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
  cierre: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  cierreQr: {
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  cierreFirma: {
    flexGrow: 1,
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
  firmaRapida: {
    alignSelf: "flex-end",
    alignItems: "center",
    marginTop: 28,
    width: 140,
  },
  firmaRapidaLinea: {
    borderTopColor: PDF_COLORS.text,
    borderTopWidth: 0.75,
    width: "100%",
  },
  firmaRapidaLabel: {
    color: PDF_COLORS.muted,
    fontSize: 7.5,
    marginTop: 3,
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

/**
 * Informe de resultados. Una hoja (Page) por grupo; cabecera y pie fijos en
 * todas las páginas. QR y firma/sello sólo en la última hoja; las demás
 * llevan una línea para firma manual.
 */
export function ResultadoPDF({ data, soloGrupo }: ResultadoPDFProps) {
  const config = data.config;
  const laboratoryName = config?.nombre.trim() || FALLBACK_LAB_NAME;
  const todos = agruparExamenes(data.examenes);
  const elegido = soloGrupo ? todos.filter((g) => g.titulo_id === soloGrupo) : [];
  const grupos = elegido.length > 0 ? elegido : todos;
  const esInformeDeGrupo = elegido.length > 0;
  const numero = formatNumeroOrden(data.numero_correlativo, data.created_at);
  const fechaEmision = formatDateDMY(data.fecha_resultado ?? new Date());

  const meta = [
    { label: "Nº", value: numero },
    { label: "Fecha de muestra", value: formatDateDMY(data.fecha_muestra) },
  ];

  return (
    <Document
      author={laboratoryName}
      subject="Informe de resultados de laboratorio"
      title={`Resultados - ${data.paciente.nombre} ${data.paciente.apellido}`}
    >
      {/* Una hoja por grupo (Hematología, Orina, Química…) con su cabecera y
          datos del paciente. Observaciones, QR y firma digital sólo en la
          última. */}
      {(grupos.length > 0 ? grupos : [null]).map((grupo, index, hojas) => (
        <Page key={grupo?.titulo ?? "__vacio__"} size="A4" style={styles.page}>
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

          {grupo ? (
            <View>
              <Text minPresenceAhead={60} style={styles.groupTitle}>
                {grupo.titulo}
              </Text>
              {grupo.secciones.map((seccion, i) => (
                <View key={`${seccion.tipo ?? "__directas__"}-${i}`}>
                  {seccion.tipo ? (
                    <Text minPresenceAhead={40} style={styles.tipoSubtitle}>
                      {seccion.tipo}
                    </Text>
                  ) : null}
                  <ExamenesTable rows={seccion.examenes.map(toExamenesTableRow)} />
                </View>
              ))}
            </View>
          ) : null}

          {grupo?.titulo_id && data.observaciones_grupos?.[grupo.titulo_id]?.trim() ? (
            <View wrap={false} style={styles.notes}>
              <Text style={styles.notesLabel}>Observaciones de {grupo.titulo}</Text>
              <Text style={styles.notesText}>
                {data.observaciones_grupos[grupo.titulo_id]!.trim()}
              </Text>
            </View>
          ) : null}

          {!esInformeDeGrupo && index === hojas.length - 1 && data.observaciones?.trim() ? (
            <View wrap={false} style={styles.notes}>
              <Text style={styles.notesLabel}>Observaciones generales</Text>
              <Text style={styles.notesText}>{data.observaciones.trim()}</Text>
            </View>
          ) : null}

          {/* Cierre sólo en la última hoja: QR de verificación a la izquierda,
              firma y sello a la derecha. En las demás, una línea para que la
              bioanalista firme a mano. */}
          {index < hojas.length - 1 ? (
            <View wrap={false} style={styles.firmaRapida}>
              <View style={styles.firmaRapidaLinea} />
              <Text style={styles.firmaRapidaLabel}>Firma</Text>
            </View>
          ) : (
            <View wrap={false} style={styles.cierre}>
              <View style={styles.cierreQr}>
                {data.verificacion_url ? <PDFQr url={data.verificacion_url} /> : null}
              </View>
              <View style={styles.cierreFirma}>
                <PDFFirma
                  firma={config?.firma_url ?? null}
                  sello={config?.sello_url ?? null}
                  nombre={laboratoryName}
                  colegioBioanalistas={config?.colegio_bioanalistas ?? null}
                  mpps={config?.mpps ?? null}
                />
              </View>
            </View>
          )}

          <PDFFooter
            aviso={AVISO_RESULTADO}
            emision={`Emitido el ${fechaEmision}`}
            pieDePagina={config?.pdf_pie_pagina ?? null}
          />
        </Page>
      ))}
    </Document>
  );
}

export default ResultadoPDF;
