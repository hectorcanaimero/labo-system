import { z } from "zod";

/**
 * Estados posibles de un resultado de laboratorio.
 *
 * Coincide con el union del schema de Convex (`resultados.estado`).
 */
export const ESTADO_RESULTADO = ["Pendiente", "Completado"] as const;
export type EstadoResultado = (typeof ESTADO_RESULTADO)[number];

/**
 * Errores de validación del dominio de resultados.
 */
export const PACIENTE_ID_REQUERIDO = "PACIENTE_ID_REQUERIDO";
export const FECHA_MUESTRA_FUTURA = "FECHA_MUESTRA_FUTURA";
export const FECHA_RESULTADO_FUTURA = "FECHA_RESULTADO_FUTURA";
export const FECHA_RESULTADO_ANTERIOR_MUESTRA = "FECHA_RESULTADO_ANTERIOR_MUESTRA";
export const EXAMENES_REQUERIDOS = "EXAMENES_REQUERIDOS";
export const EXAMEN_ID_REQUERIDO = "EXAMEN_ID_REQUERIDO";
export const ESTADO_INVALIDO = "ESTADO_INVALIDO";

/**
 * Schema para el enum de estado de un resultado.
 */
export const estadoResultadoSchema = z.enum(ESTADO_RESULTADO, {
  errorMap: () => ({ message: ESTADO_INVALIDO }),
});

/**
 * Valida que un timestamp (ms) no sea futuro.
 *
 * Se acepta igual al instante actual (`<= now`) para no rechazar fechas
 * capturadas en el mismo milisegundo de la validación.
 */
function fechaNoFutura(message: string) {
  return z.number().refine((v) => v <= Date.now(), { message });
}

/**
 * Línea de resultado: un examen con su valor observado.
 *
 * Los snapshots (`nombre_snap`, `precio_snap`, etc.) los resuelve el backend,
 * por lo que acá solo se valida la referencia al examen y el valor.
 */
export const lineaResultadoSchema = z.object({
  examen_id: z.string().min(1, { message: EXAMEN_ID_REQUERIDO }),
  valor: z.string(),
  observacion: z.string().optional(),
});
export type LineaResultadoInput = z.infer<typeof lineaResultadoSchema>;

/**
 * Schema de creación de un resultado.
 *
 * - `fecha_muestra` requerida y no futura.
 * - `examenes` requerido y no vacío.
 * - `estado` no se envía: lo calcula el backend en función de `fecha_resultado`.
 */
export const resultadoCreateSchema = z
  .object({
    paciente_id: z.string().min(1, { message: PACIENTE_ID_REQUERIDO }),
    fecha_muestra: fechaNoFutura(FECHA_MUESTRA_FUTURA),
    fecha_resultado: fechaNoFutura(FECHA_RESULTADO_FUTURA).optional(),
    medico_solicitante: z.string().optional(),
    observaciones: z.string().optional(),
    examenes: z
      .array(lineaResultadoSchema)
      .min(1, { message: EXAMENES_REQUERIDOS }),
  })
  .refine(
    (data) =>
      data.fecha_resultado === undefined ||
      data.fecha_resultado >= data.fecha_muestra,
    { message: FECHA_RESULTADO_ANTERIOR_MUESTRA, path: ["fecha_resultado"] },
  );
export type ResultadoCreateInput = z.infer<typeof resultadoCreateSchema>;

/**
 * Schema de actualización de un resultado.
 *
 * Todos los campos son opcionales; si se envía `examenes` no puede ser vacío.
 * `paciente_id` no se edita: se mantiene el original.
 */
export const resultadoUpdateSchema = z
  .object({
    fecha_muestra: fechaNoFutura(FECHA_MUESTRA_FUTURA).optional(),
    fecha_resultado: fechaNoFutura(FECHA_RESULTADO_FUTURA).optional(),
    medico_solicitante: z.string().optional(),
    estado: estadoResultadoSchema.optional(),
    observaciones: z.string().optional(),
    examenes: z
      .array(lineaResultadoSchema)
      .min(1, { message: EXAMENES_REQUERIDOS })
      .optional(),
  })
  .refine(
    (data) =>
      data.fecha_muestra === undefined ||
      data.fecha_resultado === undefined ||
      data.fecha_resultado >= data.fecha_muestra,
    { message: FECHA_RESULTADO_ANTERIOR_MUESTRA, path: ["fecha_resultado"] },
  );
export type ResultadoUpdateInput = z.infer<typeof resultadoUpdateSchema>;
