"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, PencilLine, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toHumanError } from "@labo/lib/error-messages";

interface TituloDraft {
  id: string;
  nombre: string;
  orden: number;
}

interface TituloFormDialogProps {
  initialOrden: number;
  onOpenChange: (open: boolean) => void;
  onSaved: (titulo: TituloDraft) => void;
  open: boolean;
  titulo?: TituloDraft | null;
}

interface ApiErrorPayload {
  error?: string;
}

async function readApiError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return new Error(payload?.error ?? "ERROR_GENERICO");
}

export function TituloFormDialog({
  initialOrden,
  onOpenChange,
  onSaved,
  open,
  titulo,
}: TituloFormDialogProps) {
  const isEdit = Boolean(titulo);
  const [nombre, setNombre] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogTitle = useMemo(
    () => (isEdit ? "Editar título" : "Nuevo título"),
    [isEdit],
  );

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setErrorMessage(null);
      return;
    }

    setNombre(titulo?.nombre ?? "");
    setErrorMessage(null);
  }, [open, titulo]);

  if (!open) {
    return null;
  }

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNombre = nombre.trim();

    if (trimmedNombre.length === 0) {
      setErrorMessage("Ingresá un nombre para el título.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        isEdit ? `/api/examenes/titulos/${titulo?.id}` : "/api/examenes/titulos",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(
            isEdit
              ? { nombre: trimmedNombre }
              : { nombre: trimmedNombre, orden: initialOrden },
          ),
        },
      );

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

      const savedTitulo = (await response.json()) as TituloDraft;
      onSaved(savedTitulo);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(toHumanError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold leading-none tracking-tight">
              {dialogTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? "Actualizá el nombre visible del grupo en el catálogo."
                : "Creá un nuevo grupo para organizar exámenes relacionados."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="titulo-nombre" className="text-sm font-medium">
              Nombre del título
            </label>
            <input
              id="titulo-nombre"
              type="text"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              disabled={submitting}
              placeholder="Ej. Hematología"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Guardando...
                </>
              ) : isEdit ? (
                <>
                  <PencilLine />
                  Guardar cambios
                </>
              ) : (
                <>
                  <Plus />
                  Crear título
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
