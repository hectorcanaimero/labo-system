"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, PencilLine, Plus } from "lucide-react";

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

import { apiFetch } from "@/lib/api-client";
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
    () => (isEdit ? "Editar grupo" : "Nuevo grupo"),
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

  const handleOpenChange = (next: boolean) => {
    if (!next && submitting) return;
    onOpenChange(next);
  };

  const handleClose = () => {
    handleOpenChange(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNombre = nombre.trim();

    if (trimmedNombre.length === 0) {
      setErrorMessage("Ingresá un nombre para el grupo.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await apiFetch(
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-md flex-col gap-0 overflow-hidden p-0 text-card-foreground">
        <DialogHeader className="px-6 pb-4 pr-12 pt-6">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualizá el nombre visible del grupo en el catálogo."
              : "Creá un nuevo grupo para organizar exámenes relacionados."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="titulo-nombre" className="text-sm font-medium">
                Nombre del grupo
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
          </DialogBody>

          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-card px-6 py-4">
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
                  Crear grupo
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
