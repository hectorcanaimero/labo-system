'use client';

import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Loader2, PencilLine, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toHumanError } from '@labo/lib/error-messages';
import { TIPO_ANALISIS_VALUES } from '@labo/lib/schemas/examen';

import { apiFetch } from "@/lib/api-client";
interface ExamenDraft {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  valores_referencia: string | null;
  tipo_analisis: string | null;
  metodo: string | null;
  observaciones: string | null;
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
  return new Error(payload?.error ?? 'ERROR_GENERICO');
}

function formatPriceInput(price?: number): string {
  return typeof price === 'number' && Number.isFinite(price) ? price.toFixed(2) : '';
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
  const [nombre, setNombre] = useState('');
  const [precioUsd, setPrecioUsd] = useState('');
  const [unidad, setUnidad] = useState('');
  const [valoresReferencia, setValoresReferencia] = useState('');
  const [tipoAnalisis, setTipoAnalisis] = useState('');
  const [metodo, setMetodo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogTitle = useMemo(() => (isEdit ? 'Editar examen' : 'Nuevo examen'), [isEdit]);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setErrorMessage(null);
      return;
    }

    setNombre(examen?.nombre ?? '');
    setPrecioUsd(formatPriceInput(examen?.precio_usd));
    setUnidad(examen?.unidad ?? '');
    setValoresReferencia(examen?.valores_referencia ?? '');
    setTipoAnalisis(examen?.tipo_analisis ?? '');
    setMetodo(examen?.metodo ?? '');
    setObservaciones(examen?.observaciones ?? '');
    setErrorMessage(null);
  }, [examen, open]);

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
    const parsedPrecio = Number.parseFloat(precioUsd.replace(',', '.'));

    if (trimmedNombre.length === 0) {
      setErrorMessage('Ingresá el nombre del examen.');
      return;
    }

    if (!Number.isFinite(parsedPrecio) || parsedPrecio < 0) {
      setErrorMessage('Ingresá un precio válido en USD.');
      return;
    }

    if (tipoAnalisis.trim().length === 0) {
      setErrorMessage('Elegí un tipo de análisis.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await apiFetch(isEdit ? `/api/examenes/${examen?.id}` : '/api/examenes', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(
          isEdit
            ? {
                nombre: trimmedNombre,
                precio_usd: Number(parsedPrecio.toFixed(2)),
                unidad,
                valores_referencia: valoresReferencia,
                tipo_analisis: tipoAnalisis.trim(),
                metodo: metodo.trim() || null,
                observaciones: observaciones.trim() || null,
              }
            : {
                titulo_id: tituloId,
                nombre: trimmedNombre,
                precio_usd: Number(parsedPrecio.toFixed(2)),
                unidad,
                valores_referencia: valoresReferencia,
                tipo_analisis: tipoAnalisis.trim(),
                metodo: metodo.trim() || null,
                observaciones: observaciones.trim() || null,
              }
        ),
      });

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 text-card-foreground">
        <DialogHeader className="px-6 pb-4 pt-6 pr-12">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Actualizá nombre, precio y referencia de ${tituloNombre}.`
              : `Agregá un nuevo examen dentro de ${tituloNombre}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4 md:grid-cols-2">
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
                Precio base (USD)
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

            <div className="flex flex-col gap-2">
              <label htmlFor="examen-tipo-analisis" className="text-sm font-medium">
                Tipo de análisis
                <span className="ml-1 text-destructive">*</span>
              </label>
              <select
                id="examen-tipo-analisis"
                value={tipoAnalisis}
                onChange={(event) => setTipoAnalisis(event.target.value)}
                disabled={submitting}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Seleccionar tipo...</option>
                {TIPO_ANALISIS_VALUES.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label htmlFor="examen-metodo" className="text-sm font-medium">
                Método
              </label>
              <input
                id="examen-metodo"
                type="text"
                value={metodo}
                onChange={(event) => setMetodo(event.target.value)}
                disabled={submitting}
                list="metodos-list"
                placeholder="Ej. Espectrofotometría, ELISA"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <datalist id="metodos-list">
                <option value="Espectrofotometría" />
                <option value="Quimioluminiscencia" />
                <option value="ELISA" />
                <option value="Microscopía" />
                <option value="PCR" />
                <option value="Inmunocromatografía" />
              </datalist>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label htmlFor="examen-referencia" className="text-sm font-medium">
                Valores normales
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

            <div className="flex flex-col gap-2 md:col-span-2">
              <label htmlFor="examen-observaciones" className="text-sm font-medium">
                Observaciones
              </label>
              <textarea
                id="examen-observaciones"
                value={observaciones}
                onChange={(event) => setObservaciones(event.target.value)}
                disabled={submitting}
                placeholder="Ej. Requiere ayuno de 8 horas. Muestra en tubo con EDTA."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Notas para el paciente o el operador. Opcional.
              </p>
            </div>

            {errorMessage ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2">
                {errorMessage}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-card px-6 py-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
