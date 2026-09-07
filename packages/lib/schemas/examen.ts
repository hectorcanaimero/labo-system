import { z } from "zod";

const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
const TIPO_ANALISIS_REQUERIDO = "TIPO_ANALISIS_REQUERIDO";

/**
 * Vocabulario inicial de tipos de análisis.
 *
 * Ya NO se valida contra esta lista: desde F7.4.T3 el vocabulario lo da la
 * tabla `tipos_analisis` (migración 0019), que el admin mantiene desde
 * Catálogo → Tipos y métodos. Estos ocho valores quedan como la semilla con la
 * que se pobló esa tabla, y como referencia de qué había antes.
 *
 * `examenes.tipo_analisis` sigue siendo `text NOT NULL` en la base.
 */
export const TIPO_ANALISIS_VALUES = [
  "Análisis Químico",
  "Análisis Hematológico",
  "Análisis Microbiológico",
  "Análisis Inmunológico",
  "Análisis Hormonal",
  "Análisis Físico-químico",
  "Análisis Molecular",
  "Otro",
] as const;

export type TipoAnalisis = (typeof TIPO_ANALISIS_VALUES)[number];

/**
 * Texto no vacío. La lista de valores válidos vive en `tipos_analisis` y se
 * ofrece en el selector; el schema sólo exige que el examen tenga alguno.
 *
 * No se valida contra la tabla acá a propósito: un examen cuyo tipo fue
 * desactivado o renombrado tiene que poder volver a guardarse sin perderlo,
 * igual que pasa con `metodo`.
 */
const tipoAnalisisSchema = z
  .string({ required_error: TIPO_ANALISIS_REQUERIDO, invalid_type_error: TIPO_ANALISIS_REQUERIDO })
  .trim()
  .min(1, { message: TIPO_ANALISIS_REQUERIDO });

const textoOpcionalSanitizado = z.string().trim().optional();

const examenEditable = z.object({
  nombre: z.string().trim().min(1, { message: VALIDACION_FALLIDA }),
  precio_usd: z.number().nonnegative({ message: VALIDACION_FALLIDA }),
  unidad: textoOpcionalSanitizado,
  valores_referencia: textoOpcionalSanitizado,
  tipo_analisis: tipoAnalisisSchema,
  metodo: textoOpcionalSanitizado,
  observaciones: textoOpcionalSanitizado,
});

export const examenCreate = examenEditable.extend({
  titulo_id: z.string().trim().min(1, { message: VALIDACION_FALLIDA }),
});

export type ExamenCreateInput = z.infer<typeof examenCreate>;

export const examenUpdate = examenEditable.partial();

export type ExamenUpdateInput = z.infer<typeof examenUpdate>;
