import { z } from "zod";

/**
 * Estados del pipeline operativo de una orden de laboratorio.
 *
 * Sucesor del enum viejo `ESTADO_RESULTADO` (Pendiente/Completado). El nuevo
 * flujo refleja las etapas reales del trabajo del laboratorio:
 *
 *   Registrada → Muestra tomada → En proceso → Validando → Entregada
 *                                                              ↓
 *                                                          Anulada
 */
export const ESTADO_ORDEN = [
  "Registrada",
  "Muestra tomada",
  "En proceso",
  "Validando",
  "Entregada",
  "Anulada",
] as const;
export type EstadoOrden = (typeof ESTADO_ORDEN)[number];

/**
 * Alias legacy — mantiene compatibilidad con código que aún importa el
 * nombre viejo. Nuevas features deberían usar `ESTADO_ORDEN` / `EstadoOrden`.
 */
export const ESTADO_RESULTADO = ESTADO_ORDEN;
export type EstadoResultado = EstadoOrden;

// ─────────────────────────────────────────────────────────────────────────────
// Códigos de error de dominio
// ─────────────────────────────────────────────────────────────────────────────

export const PACIENTE_ID_REQUERIDO = "PACIENTE_ID_REQUERIDO";
export const FECHA_MUESTRA_FUTURA = "FECHA_MUESTRA_FUTURA";
export const FECHA_RESULTADO_FUTURA = "FECHA_RESULTADO_FUTURA";
export const FECHA_RESULTADO_ANTERIOR_MUESTRA = "FECHA_RESULTADO_ANTERIOR_MUESTRA";
export const EXAMENES_REQUERIDOS = "EXAMENES_REQUERIDOS";
export const EXAMEN_ID_REQUERIDO = "EXAMEN_ID_REQUERIDO";
export const ESTADO_INVALIDO = "ESTADO_INVALIDO";

export const estadoOrdenSchema = z.enum(ESTADO_ORDEN, {
  errorMap: () => ({ message: ESTADO_INVALIDO }),
});

/** Alias legacy. */
export const estadoResultadoSchema = estadoOrdenSchema;

// ─────────────────────────────────────────────────────────────────────────────
// Validators
// ─────────────────────────────────────────────────────────────────────────────

function fechaNoFutura(message: string) {
  return z.number().refine((v) => v <= Date.now(), { message });
}

/**
 * Línea de orden: un examen con su valor observado.
 * Los snapshots (nombre, precio, unidad, valores de referencia) los completa
 * el backend al crear la orden.
 */
export const lineaOrdenSchema = z.object({
  examen_id: z.string().min(1, { message: EXAMEN_ID_REQUERIDO }),
  valor: z.string(),
  observacion: z.string().optional(),
});
export type LineaOrdenInput = z.infer<typeof lineaOrdenSchema>;

/** Alias legacy. */
export const lineaResultadoSchema = lineaOrdenSchema;
export type LineaResultadoInput = LineaOrdenInput;

/**
 * Schema de creación de una orden.
 * - Paciente obligatorio (a diferencia del presupuesto, que admite nombre libre).
 * - `estado` no se envía: el backend lo fija a 'Registrada'.
 */
export const ordenCreateSchema = z
  .object({
    paciente_id: z.string().min(1, { message: PACIENTE_ID_REQUERIDO }),
    fecha_muestra: fechaNoFutura(FECHA_MUESTRA_FUTURA),
    fecha_resultado: fechaNoFutura(FECHA_RESULTADO_FUTURA).optional(),
    medico_solicitante: z.string().optional(),
    observaciones: z.string().optional(),
    examenes: z.array(lineaOrdenSchema).min(1, { message: EXAMENES_REQUERIDOS }),
  })
  .refine(
    (data) =>
      data.fecha_resultado === undefined ||
      data.fecha_resultado >= data.fecha_muestra,
    { message: FECHA_RESULTADO_ANTERIOR_MUESTRA, path: ["fecha_resultado"] },
  );
export type OrdenCreateInput = z.infer<typeof ordenCreateSchema>;

/** Alias legacy. */
export const resultadoCreateSchema = ordenCreateSchema;
export type ResultadoCreateInput = OrdenCreateInput;

/**
 * Schema de actualización de una orden.
 */
export const ordenUpdateSchema = z
  .object({
    fecha_muestra: fechaNoFutura(FECHA_MUESTRA_FUTURA).optional(),
    fecha_resultado: fechaNoFutura(FECHA_RESULTADO_FUTURA).optional(),
    medico_solicitante: z.string().optional(),
    estado: estadoOrdenSchema.optional(),
    observaciones: z.string().optional(),
    examenes: z
      .array(lineaOrdenSchema)
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
export type OrdenUpdateInput = z.infer<typeof ordenUpdateSchema>;

/** Alias legacy. */
export const resultadoUpdateSchema = ordenUpdateSchema;
export type ResultadoUpdateInput = OrdenUpdateInput;
