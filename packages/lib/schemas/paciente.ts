import { z } from "zod";

import { normalizeCedula } from "../cedula";
import { normalizarTelefonoWhatsApp } from "../enlace-resultado";
import { calcularEdad } from "../edad";
import { esUbicacionValida } from "../ubicacion";

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
export const CEDULA_REQUERIDA = "CEDULA_REQUERIDA";
export const FECHA_NACIMIENTO_FUTURA = "FECHA_NACIMIENTO_FUTURA";
export const SEXO_REQUERIDO = "SEXO_REQUERIDO";
export const DIRECCION_REQUERIDA = "DIRECCION_REQUERIDA";
export const UBICACION_INVALIDA = "UBICACION_INVALIDA";
export const CONTACTO_REQUERIDO = "CONTACTO_REQUERIDO";
export const TELEFONO_INVALIDO = "TELEFONO_INVALIDO";

/**
 * Sexo biológico admitido para pacientes (ADR-06 / §6 modelo de datos).
 */
export const SEXO_VALUES = ["M", "F"] as const;

export const sexoSchema = z.enum(["M", "F"], {
  errorMap: () => ({ message: SEXO_REQUERIDO }),
});

/**
 * ADR-06: la cédula de un paciente normaliza siempre a `V-XXXXXXXX` (venezolano)
 * o `E-XXXXXXXX` (extranjero). `normalizeCedula` acepta además los prefijos
 * J/G/P (jurídico/gobierno/pasaporte) y dígitos sin prefijo — válidos para la
 * migración, pero NO para un paciente natural. Por eso el schema revalida que el
 * resultado normalizado empiece con V o E.
 */
const CEDULA_PACIENTE_RE = /^[VE]-\d{5,9}$/;

/**
 * Los niños menores de esta edad suelen no tener cédula: se registran sin ella
 * (NULL) en vez de inventar una (`V-0000000`), que además choca con
 * `pacientes_cedula_unique`.
 */
export const EDAD_MAXIMA_SIN_CEDULA = 10;

export function puedeOmitirCedula(fechaNacimiento: unknown): boolean {
  if (!(fechaNacimiento instanceof Date) && typeof fechaNacimiento !== "string" && typeof fechaNacimiento !== "number") {
    return false;
  }
  const fecha = new Date(fechaNacimiento);
  if (Number.isNaN(fecha.getTime())) return false;
  return calcularEdad(fecha) < EDAD_MAXIMA_SIN_CEDULA;
}

/** Vacío → `null` (menor sin cédula); si no, normaliza y valida. */
const cedulaSchema = z.string().nullable().transform((raw, ctx) => {
  if (raw === null || raw.trim() === "") return null;

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
 * El teléfono se guarda solo en dígitos con código de país (`584241234567`),
 * el mismo formato que usa `wa.me`; la UI lo formatea al mostrarlo.
 */
const telefonoSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (raw === undefined || raw.trim() === "") return undefined;
    const normalizado = normalizarTelefonoWhatsApp(raw);
    if (normalizado === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: TELEFONO_INVALIDO });
      return z.NEVER;
    }
    return normalizado;
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
const pacienteBase = z.object({
  nombre: z.string().trim().min(1, { message: NOMBRE_REQUERIDO }),
  apellido: z.string().trim().min(1, { message: APELLIDO_REQUERIDO }),
  cedula: cedulaSchema,
  fecha_nacimiento: fechaNacimientoSchema,
  sexo: sexoSchema,
  telefono: telefonoSchema,
  email: z.string().optional(),
  direccion: z
    .string({ required_error: DIRECCION_REQUERIDA })
    .trim()
    .min(5, { message: DIRECCION_REQUERIDA }),
  ubicacion_url: z
    .string()
    .optional()
    .refine((value) => value === undefined || esUbicacionValida(value), {
      message: UBICACION_INVALIDA,
    }),
});

function exigirCedulaSalvoMenor(
  data: { cedula?: string | null; fecha_nacimiento?: number },
  ctx: z.RefinementCtx,
): void {
  if (data.cedula === null && !puedeOmitirCedula(data.fecha_nacimiento)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: CEDULA_REQUERIDA, path: ["cedula"] });
  }
}

export const pacienteCreate = pacienteBase.superRefine(exigirCedulaSalvoMenor);

export type PacienteCreateInput = z.infer<typeof pacienteCreate>;

/**
 * Schema de actualización: todos los campos opcionales. Si se envía `cedula` o
 * `fecha_nacimiento` se aplica la misma normalización/validación que en create.
 */
export const pacienteUpdate = pacienteBase.partial().superRefine(exigirCedulaSalvoMenor);

export type PacienteUpdateInput = z.infer<typeof pacienteUpdate>;

/**
 * Schema de búsqueda (query `pacientes.search`, contrato §5.1).
 */
export const pacienteSearch = z.object({
  term: z.string().trim(),
});

export type PacienteSearchInput = z.infer<typeof pacienteSearch>;

/**
 * Ficha provisional (F8.2.T1): la crea `presupuestos.create` cuando el
 * presupuesto no tiene un paciente con ficha completa todavía (antes se
 * guardaba solo `paciente_nombre_libre`, que no se podía enviar ni aparecía
 * en Pacientes). Pide lo mínimo para poder contactar al paciente; cédula,
 * fecha de nacimiento y sexo se completan después desde la ficha.
 */
export const pacienteProvisionalSchema = z
  .object({
    nombre: z.string().trim().min(1, { message: NOMBRE_REQUERIDO }),
    apellido: z.string().trim().min(1, { message: APELLIDO_REQUERIDO }),
    telefono: telefonoSchema,
    email: z.string().trim().optional(),
  })
  .refine((data) => (data.telefono?.length ?? 0) > 0 || (data.email?.length ?? 0) > 0, {
    message: CONTACTO_REQUERIDO,
    path: ["telefono"],
  });

export type PacienteProvisionalInput = z.infer<typeof pacienteProvisionalSchema>;

/**
 * Una ficha es incompleta cuando le falta cédula (salvo menores, ver
 * `puedeOmitirCedula`), fecha de nacimiento o sexo
 * — los tres campos que `0023_pacientes_ficha_incompleta.sql` relajó a NULL
 * para permitir crear la ficha provisional de un presupuesto. No hay columna
 * "incompleta": esta función pura es la única fuente de la regla, para que
 * UI y backend no diverjan.
 */
export interface FichaIncompleta {
  cedula: string | null;
  fecha_nacimiento: unknown;
  sexo: string | null;
}

export function esFichaIncompleta(paciente: FichaIncompleta): boolean {
  return (
    (paciente.cedula == null && !puedeOmitirCedula(paciente.fecha_nacimiento)) ||
    paciente.fecha_nacimiento == null ||
    paciente.sexo == null
  );
}
