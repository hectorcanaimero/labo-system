import { z } from "zod";

const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";

const nombreSchema = z.string().trim().min(1, { message: VALIDACION_FALLIDA });

const descripcionCreateSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

const descripcionUpdateSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

export const paqueteCreate = z.object({
  nombre: nombreSchema,
  descripcion: descripcionCreateSchema,
});

export type PaqueteCreateInput = z.infer<typeof paqueteCreate>;

export const paqueteUpdate = z.object({
  nombre: nombreSchema.optional(),
  descripcion: descripcionUpdateSchema,
});

export type PaqueteUpdateInput = z.infer<typeof paqueteUpdate>;
