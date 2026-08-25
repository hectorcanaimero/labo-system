"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { Loader2, PencilLine, Trash2, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toHumanError } from "@labo/lib/error-messages";
import {
  pacienteCreate,
  type PacienteCreateInput,
} from "@labo/lib/schemas/paciente";

/**
 * Máscara visual de cédula venezolana: `V-12.345.678`.
 * El valor enmascarado es aceptado por `normalizeCedula` (que tolera
 * puntos/guiones), así que el schema no cambia.
 */
export function formatCedulaMask(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^VEJGP0-9]/g, "");
  const hasPrefix = /^[VEJGP]/.test(cleaned);
  const prefix = hasPrefix ? cleaned[0] : "";
  const digits = (hasPrefix ? cleaned.slice(1) : cleaned).replace(/^[^0-9]+/, "").slice(0, 8);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (!prefix) return grouped;
  return digits.length > 0 ? `${prefix}-${grouped}` : prefix;
}

/**
 * Máscara visual de teléfono VE: `+58 412-1234567` (internacional) o
 * `0412-1234567` (nacional). Tolerante a tipeo parcial.
 */
export function formatTelefonoVeMask(raw: string): string {
  const plus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (plus || digits.startsWith("58")) {
    const rest = (plus ? digits : digits.replace(/^58/, "")).slice(0, 10);
    const head = rest.slice(0, 3);
    const tail = rest.slice(3);
    return `+58 ${head}${tail ? `-${tail}` : ""}`;
  }
  const national = digits.slice(0, 11);
  if (national.startsWith("0")) {
    const head = national.slice(0, 4);
    const tail = national.slice(4);
    return `${head}${tail ? `-${tail}` : ""}`;
  }
  return national;
}

export interface PacienteSerializable {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: string;
  sexo: "M" | "F" | "O" | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PacienteFormValues {
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: string;
  sexo: "" | "M" | "F" | "O";
  telefono: string;
  email: string;
  direccion: string;
}

interface PacienteFormDialogProps {
  paciente?: PacienteSerializable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (paciente: PacienteSerializable) => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
}

function toDateInputValue(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toSchemaInput(values: PacienteFormValues): Omit<PacienteCreateInput, "fecha_nacimiento"> & {
  fecha_nacimiento: Date;
} {
  return {
    nombre: values.nombre,
    apellido: values.apellido,
    cedula: values.cedula,
    fecha_nacimiento: new Date(`${values.fecha_nacimiento}T00:00:00.000Z`),
    sexo: values.sexo || undefined,
    telefono: values.telefono,
    email: values.email,
    direccion: values.direccion,
  };
}

function mapResolverErrors(values: PacienteFormValues): FieldErrors<PacienteFormValues> {
  const parsed = pacienteCreate.safeParse(toSchemaInput(values));
  if (parsed.success) {
    return {};
  }

  const errors: FieldErrors<PacienteFormValues> = {};

  for (const issue of parsed.error.issues) {
    const path = issue.path[0];
    if (typeof path !== "string") continue;
    if (path in values) {
      errors[path as keyof PacienteFormValues] = {
        type: issue.code,
        message: toHumanError(issue.message, issue.message),
      };
    }
  }

  return errors;
}

const pacienteFormResolver: Resolver<PacienteFormValues> = async (values) => {
  const errors = mapResolverErrors(values);
  if (Object.keys(errors).length > 0) {
    return {
      values: {},
      errors,
    };
  }

  return {
    values,
    errors: {},
  };
};

async function readApiError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error ?? "ERROR_GENERICO");
}

export function PacienteFormDialog({
  paciente,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: PacienteFormDialogProps) {
  const isEdit = Boolean(paciente);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogTitle = useMemo(
    () => (isEdit ? "Editar paciente" : "Nuevo paciente"),
    [isEdit],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PacienteFormValues>({
    resolver: pacienteFormResolver,
    defaultValues: {
      nombre: "",
      apellido: "",
      cedula: "",
      fecha_nacimiento: "",
      sexo: "",
      telefono: "",
      email: "",
      direccion: "",
    },
  });

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setDeleting(false);
      setErrorMessage(null);
      return;
    }

    reset({
      nombre: paciente?.nombre ?? "",
      apellido: paciente?.apellido ?? "",
      cedula: formatCedulaMask(paciente?.cedula ?? ""),
      fecha_nacimiento: toDateInputValue(paciente?.fecha_nacimiento),
      sexo: paciente?.sexo ?? "",
      telefono: formatTelefonoVeMask(paciente?.telefono ?? ""),
      email: paciente?.email ?? "",
      direccion: paciente?.direccion ?? "",
    });
    setErrorMessage(null);
  }, [open, paciente, reset]);

  if (!open) {
    return null;
  }

  const cedulaField = register("cedula");
  const telefonoField = register("telefono");

  async function onSubmit(values: PacienteFormValues): Promise<void> {
    try {
      setSubmitting(true);
      setErrorMessage(null);

      const response = await fetch(isEdit ? `/api/pacientes/${paciente?.id}` : "/api/pacientes", {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          nombre: values.nombre,
          apellido: values.apellido,
          cedula: values.cedula,
          fecha_nacimiento: `${values.fecha_nacimiento}T00:00:00.000Z`,
          sexo: values.sexo || undefined,
          telefono: values.telefono.trim() || undefined,
          email: values.email.trim() || undefined,
          direccion: values.direccion.trim() || undefined,
        }),
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (response.status === 403) {
        window.location.href = "/dashboard?reason=sin-permisos";
        return;
      }
      if (!response.ok) {
        throw await readApiError(response);
      }

      const savedPaciente = (await response.json()) as PacienteSerializable;
      await onSaved(savedPaciente);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(toHumanError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!paciente) return;

    const confirmed = window.confirm(
      `¿Seguro que querés desactivar a ${paciente.nombre} ${paciente.apellido}?`,
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      setErrorMessage(null);

      const response = await fetch(`/api/pacientes/${paciente.id}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (response.status === 403) {
        window.location.href = "/dashboard?reason=sin-permisos";
        return;
      }
      if (!response.ok) {
        throw await readApiError(response);
      }

      await onDeleted?.();
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(toHumanError(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold leading-none tracking-tight">{dialogTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? "Actualizá la ficha base del paciente y mantené el historial alineado."
                : "Completá los datos mínimos para registrar una nueva ficha."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => !submitting && !deleting && onOpenChange(false)}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="paciente-nombre" className="text-sm font-medium">
              Nombre
            </label>
            <div className="relative">
              <UserRound className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground/60" />
              <input
                id="paciente-nombre"
                type="text"
                disabled={submitting || deleting}
                placeholder="Ej. María"
                className="flex h-11 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                {...register("nombre")}
              />
            </div>
            {errors.nombre ? <p className="text-xs text-destructive">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="paciente-apellido" className="text-sm font-medium">
              Apellido
            </label>
            <input
              id="paciente-apellido"
              type="text"
              disabled={submitting || deleting}
              placeholder="Ej. Pérez"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...register("apellido")}
            />
            {errors.apellido ? <p className="text-xs text-destructive">{errors.apellido.message}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="paciente-cedula" className="text-sm font-medium">
              Cédula
            </label>
            <input
              id="paciente-cedula"
              type="text"
              inputMode="numeric"
              disabled={submitting || deleting}
              placeholder="V-12.345.678"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...cedulaField}
              onChange={(e) => {
                e.target.value = formatCedulaMask(e.target.value);
                cedulaField.onChange(e);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Formato: V-12.345.678 — prefijo V, E, J, G o P + hasta 8 dígitos.
            </p>
            {errors.cedula ? <p className="text-xs text-destructive">{errors.cedula.message}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="paciente-fecha" className="text-sm font-medium">
              Fecha de nacimiento
            </label>
            <input
              id="paciente-fecha"
              type="date"
              disabled={submitting || deleting}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...register("fecha_nacimiento")}
            />
            {errors.fecha_nacimiento ? (
              <p className="text-xs text-destructive">{errors.fecha_nacimiento.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="paciente-sexo" className="text-sm font-medium">
              Sexo
            </label>
            <select
              id="paciente-sexo"
              disabled={submitting || deleting}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...register("sexo")}
            >
              <option value="">No especificado</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="O">Otro</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="paciente-telefono" className="text-sm font-medium">
              Teléfono
            </label>
            <input
              id="paciente-telefono"
              type="text"
              inputMode="tel"
              disabled={submitting || deleting}
              placeholder="Ej. +58 414-5551234"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...telefonoField}
              onChange={(e) => {
                e.target.value = formatTelefonoVeMask(e.target.value);
                telefonoField.onChange(e);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Formato: +58 412-1234567 (móvil) o 0212-555-0123 (fijo). Opcional.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="paciente-email" className="text-sm font-medium">
              Correo electrónico
            </label>
            <input
              id="paciente-email"
              type="email"
              disabled={submitting || deleting}
              placeholder="ejemplo@correo.com"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...register("email")}
            />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label htmlFor="paciente-direccion" className="text-sm font-medium">
              Dirección
            </label>
            <textarea
              id="paciente-direccion"
              rows={3}
              disabled={submitting || deleting}
              placeholder="Dirección o referencia útil para contacto"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...register("direccion")}
            />
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 pt-2 md:col-span-2 md:flex-row md:items-center md:justify-between">
            <div>
              {isEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDelete()}
                  disabled={submitting || deleting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Desactivar paciente
                </Button>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting || deleting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || deleting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <PencilLine className="h-4 w-4" />
                    {isEdit ? "Guardar cambios" : "Crear paciente"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
