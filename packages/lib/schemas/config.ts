import { z } from "zod";

/**
 * Errores de validación del formulario de configuración del laboratorio.
 */
export const NOMBRE_REQUERIDO = "NOMBRE_REQUERIDO";
export const RIF_INVALIDO = "RIF_INVALIDO";
export const DIRECCION_REQUERIDA = "DIRECCION_REQUERIDA";
export const TOMA_MUESTRA_DEFAULT_INVALIDA = "TOMA_MUESTRA_DEFAULT_INVALIDA";

/**
 * Errores de validación de assets (logo/firma/sello).
 */
export const ASSET_TAMANO_EXCEDIDO = "ASSET_TAMANO_EXCEDIDO";
export const ASSET_MIME_INVALIDO = "ASSET_MIME_INVALIDO";
export const ASSET_NO_ENCONTRADO = "ASSET_NO_ENCONTRADO";
export const ASSET_TIPO_INVALIDO = "ASSET_TIPO_INVALIDO";

/**
 * Tipos de asset soportados para la identidad visual del laboratorio.
 */
export const ASSET_TYPES = ["logo", "firma", "sello"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Tamaño máximo permitido por asset: 2 MB (PRD §7).
 */
export const MAX_ASSET_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Prefijo MIME aceptado para assets (sólo imágenes).
 */
export const ASSET_MIME_PREFIX = "image/";

/**
 * Schema para validar el tipo de asset en las mutations.
 */
export const assetTypeSchema = z.union([
  z.literal("logo"),
  z.literal("firma"),
  z.literal("sello"),
]);
export type AssetTypeInput = z.infer<typeof assetTypeSchema>;

/**
 * Valida un archivo antes del upload (defense in depth lado cliente).
 *
 * Retorna `null` si el archivo es válido, o el código de error
 * correspondiente si no lo es.
 */
export function validateAssetFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!file.type.startsWith(ASSET_MIME_PREFIX)) {
    return ASSET_MIME_INVALIDO;
  }
  if (file.size > MAX_ASSET_SIZE_BYTES) {
    return ASSET_TAMANO_EXCEDIDO;
  }
  return null;
}

/** Regex para RIF venezolano de persona natural o jurídica. */
const RIF_REGEX = /^[VJGPEC]-\d{7,9}-\d$/;

/**
 * Schema compartido para actualizar la configuración del laboratorio.
 *
 * Se usa tanto en el mutation de Convex como en la validación del cliente.
 */
export const configUpdateSchema = z.object({
  nombre: z
    .string()
    .refine((v) => v.trim().length > 0, { message: NOMBRE_REQUERIDO }),

  direccion: z
    .string()
    .refine((v) => v.trim().length > 0, { message: DIRECCION_REQUERIDA }),

  telefono: z.string().optional(),

  email: z.string().optional(),

  colegio_bioanalistas: z.string().optional(),

  mpps: z.string().optional(),

  rif: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || RIF_REGEX.test(v),
      { message: RIF_INVALIDO },
    ),

  pdf_pie_pagina: z.string().optional(),

  /**
   * Valor con el que el formulario de presupuesto precarga "Toma de muestra",
   * en USD. Refleja el CHECK `toma_muestra_default_usd >= 0` de la 0015.
   */
  toma_muestra_default_usd: z
    .number()
    .finite()
    .refine((v) => v >= 0, { message: TOMA_MUESTRA_DEFAULT_INVALIDA })
    .optional(),
});

export type ConfigUpdateInput = z.infer<typeof configUpdateSchema>;

/**
 * Variante "partial" del schema para el repo Postgres (F1.1.T5).
 *
 * A diferencia de `configUpdateSchema` (form completo, `nombre`/`direccion`
 * requeridos), acá todos los campos son opcionales: el upsert del repo
 * preserva los valores previos de los campos omitidos. Si `nombre` o `rif`
 * vienen presentes, se validan con las mismas reglas (`NOMBRE_REQUERIDO`,
 * `RIF_INVALIDO`).
 */
export const configUpdatePartialSchema = z.object({
  nombre: z
    .string()
    .refine((v) => v.trim().length > 0, { message: NOMBRE_REQUERIDO })
    .optional(),

  direccion: z
    .string()
    .refine((v) => v.trim().length > 0, { message: DIRECCION_REQUERIDA })
    .optional(),

  telefono: z.string().optional(),

  email: z.string().optional(),

  colegio_bioanalistas: z.string().optional(),

  mpps: z.string().optional(),

  rif: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || RIF_REGEX.test(v),
      { message: RIF_INVALIDO },
    ),

  pdf_pie_pagina: z.string().optional(),

  /**
   * Valor con el que el formulario de presupuesto precarga "Toma de muestra",
   * en USD. Refleja el CHECK `toma_muestra_default_usd >= 0` de la 0015.
   */
  toma_muestra_default_usd: z
    .number()
    .finite()
    .refine((v) => v >= 0, { message: TOMA_MUESTRA_DEFAULT_INVALIDA })
    .optional(),
});

export type ConfigUpdatePartialInput = z.infer<typeof configUpdatePartialSchema>;
