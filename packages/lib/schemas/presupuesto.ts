import { z } from 'zod';

/**
 * Errores de validación del dominio de presupuestos.
 *
 * Se reutilizan en la capa de repos (`packages/db/repos`) para mapear issues de
 * Zod a errores de dominio. Coinciden con los CHECKs declarativos del DDL
 * (`presupuestos.descuento_pct BETWEEN 0 AND 100`, `ganancia_pct >= 0`,
 * `tasa_bs > 0`, `presupuestos_paciente_xor`) que actúan como última red.
 */
export const DESCUENTO_FUERA_RANGO = 'DESCUENTO_FUERA_RANGO';
export const GANANCIA_NEGATIVA = 'GANANCIA_NEGATIVA';
export const TASA_INVALIDA = 'TASA_INVALIDA';
export const PACIENTE_XOR_REQUIRED = 'PACIENTE_XOR_REQUIRED';
/** Alias histórico en español; ambos exponen el código HTTP canónico. */
export const PACIENTE_XOR_REQUERIDO = PACIENTE_XOR_REQUIRED;
export const EXAMENES_REQUERIDOS = 'EXAMENES_REQUERIDOS';
export const EXAMEN_ID_REQUERIDO = 'EXAMEN_ID_REQUERIDO';
export const MOTIVO_RECHAZO_REQUERIDO = 'MOTIVO_RECHAZO_REQUERIDO';
export const PRECIO_INVALIDO = 'PRECIO_INVALIDO';

/**
 * Estados posibles del pipeline comercial de presupuestos.
 */
export const ESTADO_PRESUPUESTO = [
  'Borrador',
  'Enviado',
  'Aprobado',
  'Rechazado',
  'Cancelado',
  'Convertido',
] as const;

export const PresupuestoEstadoEnum = z.enum(ESTADO_PRESUPUESTO, {
  errorMap: () => ({ message: 'ESTADO_INVALIDO' }),
});
export type PresupuestoEstado = z.infer<typeof PresupuestoEstadoEnum>;

/** Alias de compatibilidad con el contrato anterior. */
export const estadoPresupuestoSchema = PresupuestoEstadoEnum;
export type EstadoPresupuesto = PresupuestoEstado;

/**
 * Contrato para solicitar un cambio de estado.
 *
 * El motivo es obligatorio y debe aportar contenido real cuando el presupuesto
 * pasa a `Rechazado`; en el resto de los estados es opcional.
 */
export const presupuestoCambiarEstadoSchema = z
  .object({
    estado: PresupuestoEstadoEnum,
    motivo_rechazo: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.estado === 'Rechazado' &&
      (data.motivo_rechazo == null || data.motivo_rechazo.length < 3)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: MOTIVO_RECHAZO_REQUERIDO,
        path: ['motivo_rechazo'],
      });
    }
  });

export type PresupuestoCambiarEstadoInput = z.infer<typeof presupuestoCambiarEstadoSchema>;

/**
 * Descuento expresado en porcentaje: 0..100 (inclusive).
 *
 * 150% es inválido; un descuento del 100% anula el total USD pero es legítimo
 * (caso "cortesía"). Refleja el CHECK `descuento_pct BETWEEN 0 AND 100`.
 */
export const descuentoPctSchema = z
  .number()
  .refine((v) => v >= 0 && v <= 100, { message: DESCUENTO_FUERA_RANGO });

/**
 * Ganancia (margen) expresada en porcentaje: >= 0.
 *
 * No se admite ganancia negativa (perdería dinero el laboratorio). Refleja el
 * CHECK `ganancia_pct >= 0`.
 */
export const gananciaPctSchema = z.number().refine((v) => v >= 0, { message: GANANCIA_NEGATIVA });

/**
 * Tasa de cambio Bs/USD: estrictamente > 0 (una tasa 0 produce totales Bs = 0).
 *
 * Refleja el CHECK `tasa_bs > 0`.
 */
export const tasaBsSchema = z.number().refine((v) => v > 0, { message: TASA_INVALIDA });

/** Precio snapshot de una línea, expresado en USD y nunca negativo. */
export const precioSnapshotSchema = z
  .number()
  .finite()
  .refine((v) => v >= 0, { message: PRECIO_INVALIDO });

/**
 * Línea de presupuesto: referencia al examen y snapshots de pricing.
 *
 * Los snapshots de nombre/precio/pricing pueden ser completados por el backend
 * al crear, igual que en resultados (ADR-04); por eso los campos de pricing son
 * opcionales en el payload de entrada y obligatorios en el DDL persistido.
 */
export const lineaPresupuestoSchema = z.object({
  examen_id: z.string().min(1, { message: EXAMEN_ID_REQUERIDO }),
  paquete_id: z.string().min(1).optional(),
  precio_base_snap: precioSnapshotSchema.optional(),
  ganancia_pct: gananciaPctSchema.optional(),
  precio_final_snap: precioSnapshotSchema.optional(),
});
export type LineaPresupuestoInput = z.infer<typeof lineaPresupuestoSchema>;

/**
 * Regla XOR (ADR-05): exactamente uno de `paciente_id` / `paciente_nombre_libre`.
 *
 * `(a == null) !== (b == null)` es `true` solo cuando exactamente uno es `null`.
 */
function xorPaciente(data: { paciente_id?: string; paciente_nombre_libre?: string }): boolean {
  return (data.paciente_id == null) !== (data.paciente_nombre_libre == null);
}

/**
 * Schema de creación de un presupuesto.
 *
 * - XOR: exactamente uno de `paciente_id` (ficha) o `paciente_nombre_libre`.
 * - `descuento_pct`, `ganancia_pct`, `tasa_bs` validados en rango.
 * - `examenes` requerido y no vacío.
 * - `estado` no se envía: el backend lo fija a `Borrador`.
 * - `total_usd` / `total_bs` no se envían: los precomputa el backend con
 *   `calcularTotales`.
 */
export const presupuestoCreateSchema = z
  .object({
    paciente_id: z.string().min(1).optional(),
    paciente_nombre_libre: z.string().trim().min(1).optional(),
    descuento_pct: descuentoPctSchema,
    ganancia_pct: gananciaPctSchema,
    tasa_bs: tasaBsSchema,
    examenes: z.array(lineaPresupuestoSchema).min(1, { message: EXAMENES_REQUERIDOS }),
  })
  .refine(xorPaciente, {
    message: PACIENTE_XOR_REQUIRED,
    path: ['paciente_id'],
  });

export type PresupuestoCreateInput = z.infer<typeof presupuestoCreateSchema>;

/**
 * Schema de actualización: todos los campos opcionales.
 *
 * XOR en update sólo prohíbe fijar AMBOS a la vez (`paciente_id` y
 * `paciente_nombre_libre`); setear uno solo o ninguno es válido.
 */
export const presupuestoUpdateSchema = z
  .object({
    paciente_id: z.string().min(1).optional(),
    paciente_nombre_libre: z.string().trim().min(1).optional(),
    descuento_pct: descuentoPctSchema.optional(),
    ganancia_pct: gananciaPctSchema.optional(),
    tasa_bs: tasaBsSchema.optional(),
    estado: estadoPresupuestoSchema.optional(),
    resultado_id: z.string().min(1).optional(),
    examenes: z.array(lineaPresupuestoSchema).min(1, { message: EXAMENES_REQUERIDOS }).optional(),
  })
  .refine((data) => data.paciente_id == null || data.paciente_nombre_libre == null, {
    message: PACIENTE_XOR_REQUIRED,
    path: ['paciente_nombre_libre'],
  });

export type PresupuestoUpdateInput = z.infer<typeof presupuestoUpdateSchema>;
