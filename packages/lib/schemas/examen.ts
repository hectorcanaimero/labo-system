import { z } from "zod";

const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";
const TIPO_ANALISIS_REQUERIDO = "TIPO_ANALISIS_REQUERIDO";

/**
 * Tipos de análisis permitidos para clasificar cada examen.
 * En DB `tipo_analisis` es `text NOT NULL` (sin CHECK) — el enum se enforcea
 * client-side vía este schema para poder ajustar vocabulario sin migración.
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

const tipoAnalisisSchema = z.enum(TIPO_ANALISIS_VALUES, {
  errorMap: () => ({ message: TIPO_ANALISIS_REQUERIDO }),
});

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
