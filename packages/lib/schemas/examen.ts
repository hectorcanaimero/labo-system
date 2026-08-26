import { z } from "zod";

const VALIDACION_FALLIDA = "VALIDACION_FALLIDA";

const textoOpcionalSanitizado = z.string().trim().optional();

const examenEditable = z.object({
  nombre: z.string().trim().min(1, { message: VALIDACION_FALLIDA }),
  precio_usd: z.number().nonnegative({ message: VALIDACION_FALLIDA }),
  unidad: textoOpcionalSanitizado,
  valores_referencia: textoOpcionalSanitizado,
  tipo_analisis: textoOpcionalSanitizado,
  metodo: textoOpcionalSanitizado,
});

export const examenCreate = examenEditable.extend({
  titulo_id: z.string().trim().min(1, { message: VALIDACION_FALLIDA }),
});

export type ExamenCreateInput = z.infer<typeof examenCreate>;

export const examenUpdate = examenEditable.partial();

export type ExamenUpdateInput = z.infer<typeof examenUpdate>;
