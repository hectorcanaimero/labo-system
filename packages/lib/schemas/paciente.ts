import { z } from "zod";

import { normalizeCedula } from "../cedula";

/**
 * Códigos de error de validación de pacientes.
 *
 * Se reutilizan en `packages/convex/pacientes.ts` (mutations) para mapear
 * issues de Zod a errores de dominio (`CEDULA_INVALIDA`, etc.).
 */
export const NOMBRE_REQUERIDO = "NOMBRE_REQUERIDO";
export const APELLIDO_REQUERIDO = "APELLIDO_REQUERIDO";
export const CEDULA_INVALIDA = "CEDULA_INVALIDA";
export const CEDULA_PREFIJO_INVALIDO = "CEDULA_PREFIJO_INVALIDO";
export const FECHA_NACIMIENTO_FUTURA = "FECHA_NACIMIENTO_FUTURA";

/**
 * Sexo biológico admitido para pacientes (ADR-06 / §6 modelo de datos).
 */
export const SEXO_VALUES = ["M", "F", "O"] as const;

export const sexoSchema = z.enum(SEXO_VALUES);

/**
 * ADR-06: la cédula de un paciente normaliza siempre a `V-XXXXXXXX` (venezolano)
 * o `E-XXXXXXXX` (extranjero). `normalizeCedula` acepta además los prefijos
 * J/G/P (jurídico/gobierno/pasaporte) y dígitos sin prefijo — válidos para la
 * migración, pero NO para un paciente natural. Por eso el schema revalida que el
 * resultado normalizado empiece con V o E.
 */
const CEDULA_PACIENTE_RE = /^[VE]-\d{5,9}$/;

const cedulaSchema = z.string().transform((raw, ctx) => {
  const normalized = normalizeCedula(raw);

  if (normalized === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: CEDULA_INVALIDA,
    });
    return z.NEVER;
  }

  if (!CEDULA_PACIENTE_RE.test(normalized)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: CEDULA_PREFIJO_INVALIDO,
    });
    return z.NEVER;
  }

  return normalized;
});

/**
 * `z.date()` en el input, `number` (timestamp ms) en el output.
 * Rechaza fechas futuras.
 */
const fechaNacimientoSchema = z
  .date()
  .transform((date) => date.getTime())
  .refine((ts) => ts <= Date.now(), { message: FECHA_NACIMIENTO_FUTURA });

/**
 * Schema de creación de paciente. `cedula` y `fecha_nacimiento` se normalizan
 * durante el `parse`: cédula a `V-XXXXXXXX` / `E-XXXXXXXX`, fecha a timestamp.
 */
export const pacienteCreate = z.object({
  nombre: z.string().trim().min(1, { message: NOMBRE_REQUERIDO }),
  apellido: z.string().trim().min(1, { message: APELLIDO_REQUERIDO }),
  cedula: cedulaSchema,
  fecha_nacimiento: fechaNacimientoSchema,
  sexo: sexoSchema.optional(),
  telefono: z.string().optional(),
  email: z.string().optional(),
  direccion: z.string().optional(),
});

export type PacienteCreateInput = z.infer<typeof pacienteCreate>;

/**
 * Schema de actualización: todos los campos opcionales. Si se envía `cedula` o
 * `fecha_nacimiento` se aplica la misma normalización/validación que en create.
 */
export const pacienteUpdate = pacienteCreate.partial();

export type PacienteUpdateInput = z.infer<typeof pacienteUpdate>;

/**
 * Schema de búsqueda (query `pacientes.search`, contrato §5.1).
 */
export const pacienteSearch = z.object({
  term: z.string().trim(),
});

export type PacienteSearchInput = z.infer<typeof pacienteSearch>;
