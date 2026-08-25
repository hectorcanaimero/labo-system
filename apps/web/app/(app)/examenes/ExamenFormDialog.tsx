"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, PencilLine, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toHumanError } from "@labo/lib/error-messages";

interface ExamenDraft {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
}

interface ExamenFormDialogProps {
  examen?: ExamenDraft | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (examen: ExamenDraft) => void;
  open: boolean;
  tituloId: string;
  tituloNombre: string;
}

interface ApiErrorPayload {
  error?: string;
}

async function readApiError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return new Error(payload?.error ?? "ERROR_GENERICO");
}

function formatPriceInput(price?: number): string {
  return typeof price === "number" && Number.isFinite(price) ? price.toFixed(2) : "";
}

export function ExamenFormDialog({
  examen,
  onOpenChange,
  onSaved,
  open,
  tituloId,
  tituloNombre,
}: ExamenFormDialogProps) {
  const isEdit = Boolean(examen);
  const [nombre, setNombre] = useState("");
  const [precioUsd, setPrecioUsd] = useState("");
  const [unidad, setUnidad] = useState("");
  const [valoresReferencia, setValoresReferencia] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogTitle = useMemo(
    () => (isEdit ? "Editar examen" : "Nuevo examen"),
    [isEdit],
  );

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setErrorMessage(null);
      return;
    }

    setNombre(examen?.nombre ?? "");
    setPrecioUsd(formatPriceInput(examen?.precio_usd));
    setUnidad(examen?.unidad ?? "");
    setValoresReferencia(examen?.valores_referencia ?? "");
    setErrorMessage(null);
  }, [examen, open]);

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
    const parsedPrecio = Number.parseFloat(precioUsd.replace(",", "."));

    if (trimmedNombre.length === 0) {
      setErrorMessage("Ingresá el nombre del examen.");
      return;
    }

    if (!Number.isFinite(parsedPrecio) || parsedPrecio < 0) {
      setErrorMessage("Ingresá un precio válido en USD.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(isEdit ? `/api/examenes/${examen?.id}` : "/api/examenes", {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(
          isEdit
            ? {
                nombre: trimmedNombre,
                precio_usd: Number(parsedPrecio.toFixed(2)),
                unidad,
                valores_referencia: valoresReferencia,
              }
            : {
                titulo_id: tituloId,
                nombre: trimmedNombre,
                precio_usd: Number(parsedPrecio.toFixed(2)),
                unidad,
                valores_referencia: valoresReferencia,
              },
        ),
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

      const savedExamen = (await response.json()) as ExamenDraft;
      onSaved(savedExamen);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(toHumanError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold leading-none tracking-tight">
              {dialogTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? `Actualizá nombre, precio y referencia de ${tituloNombre}.`
                : `Agregá un nuevo examen dentro de ${tituloNombre}.`}
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

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 md:col-span-2">
            <label htmlFor="examen-nombre" className="text-sm font-medium">
              Nombre del examen
            </label>
            <div className="relative">
              <FlaskConical className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground/60" />
              <input
                id="examen-nombre"
                type="text"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                disabled={submitting}
                placeholder="Ej. Hemograma completo"
                className="flex h-11 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="examen-precio" className="text-sm font-medium">
              Precio USD
            </label>
            <input
              id="examen-precio"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={precioUsd}
              onChange={(event) => setPrecioUsd(event.target.value)}
              disabled={submitting}
              placeholder="0.00"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="examen-unidad" className="text-sm font-medium">
              Unidad
            </label>
            <input
              id="examen-unidad"
              type="text"
              value={unidad}
              onChange={(event) => setUnidad(event.target.value)}
              disabled={submitting}
              placeholder="Ej. mg/dL"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label htmlFor="examen-referencia" className="text-sm font-medium">
              Valores de referencia
            </label>
            <textarea
              id="examen-referencia"
              value={valoresReferencia}
              onChange={(event) => setValoresReferencia(event.target.value)}
              disabled={submitting}
              placeholder="Ej. Adultos: 4.5 - 11.0 x10³/µL"
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 md:col-span-2">
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
                  Crear examen
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
