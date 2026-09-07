"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { Loader2, PencilLine, Trash2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toHumanError } from "@labo/lib/error-messages";
import { calcularEdadDesglosada } from "@labo/lib/edad";
import {
  pacienteCreate,
  type PacienteCreateInput,
} from "@labo/lib/schemas/paciente";

import { apiFetch } from "@/lib/api-client";
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
  /** Valores iniciales para el alta (ignorados al editar). */
  initialValues?: Partial<PacienteFormValues>;
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
    sexo: values.sexo as "M" | "F",
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
  initialValues,
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
    watch,
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

  const fechaNacimientoValue = watch("fecha_nacimiento");

  const edadInfo = useMemo(() => {
    if (!fechaNacimientoValue) return null;
    const date = new Date(`${fechaNacimientoValue}T00:00:00.000Z`);
    return calcularEdadDesglosada(date);
  }, [fechaNacimientoValue]);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setDeleting(false);
      setErrorMessage(null);
      return;
    }

    const inicial = paciente ? undefined : initialValues;
    reset({
      nombre: paciente?.nombre ?? inicial?.nombre ?? "",
      apellido: paciente?.apellido ?? inicial?.apellido ?? "",
      cedula: formatCedulaMask(paciente?.cedula ?? inicial?.cedula ?? ""),
      fecha_nacimiento: toDateInputValue(paciente?.fecha_nacimiento) || (inicial?.fecha_nacimiento ?? ""),
      sexo: paciente?.sexo ?? inicial?.sexo ?? "",
      telefono: formatTelefonoVeMask(paciente?.telefono ?? inicial?.telefono ?? ""),
      email: paciente?.email ?? inicial?.email ?? "",
      direccion: paciente?.direccion ?? inicial?.direccion ?? "",
    });
    setErrorMessage(null);
    // `initialValues` suele ser un objeto nuevo en cada render del padre; sólo
    // interesa su valor al abrir, por eso no va en las dependencias.
  }, [open, paciente, reset]);

  function handleOpenChange(next: boolean): void {
    if (!next && (submitting || deleting)) return;
    onOpenChange(next);
  }

  const cedulaField = register("cedula");
  const telefonoField = register("telefono");

  async function onSubmit(values: PacienteFormValues): Promise<void> {
    try {
      setSubmitting(true);
      setErrorMessage(null);

      const response = await apiFetch(isEdit ? `/api/pacientes/${paciente?.id}` : "/api/pacientes", {
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
          sexo: values.sexo,
          telefono: values.telefono.trim() || undefined,
          email: values.email.trim() || undefined,
          direccion: values.direccion.trim() || undefined,
        }),
      });

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

      const response = await apiFetch(`/api/pacientes/${paciente.id}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
      });

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 text-card-foreground">
        <DialogHeader className="px-6 pb-4 pr-12 pt-6">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualizá la ficha base del paciente y mantené el historial alineado."
              : "Completá los datos mínimos para registrar una nueva ficha."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4 md:grid-cols-2">
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
              {edadInfo ? (
                <div className="mt-1 inline-flex items-center gap-1.5 self-start rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <span>{edadInfo.textoFormateado}</span>
                  <span className="opacity-60">•</span>
                  <span>{edadInfo.etapa}</span>
                </div>
              ) : null}
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
                <option value="">Seleccione sexo...</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
              {errors.sexo ? <p className="text-xs text-destructive">{errors.sexo.message}</p> : null}
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

          </DialogBody>

          <DialogFooter className="shrink-0 flex-col gap-3 border-t border-border bg-card px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                onClick={() => handleOpenChange(false)}
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
