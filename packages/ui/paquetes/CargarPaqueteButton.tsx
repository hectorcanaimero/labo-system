"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";

import { EmptyState } from "../feedback";

type ClassValue = string | false | null | undefined;

function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

interface PaqueteListItem {
  id: string;
  nombre: string;
  examenes_count: number;
}

export interface PaqueteExamen {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: string | number;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
  orden: number;
}

interface ApiErrorPayload {
  error?: string;
}

export interface CargarPaqueteButtonProps {
  onLoad: (examenes: PaqueteExamen[]) => void;
  className?: string;
  disabled?: boolean;
  buttonLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  fetcher?: typeof fetch;
}

async function readApiError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return new Error(payload?.error ?? `REQUEST_FAILED_${response.status}`);
}

export function CargarPaqueteButton({
  onLoad,
  className,
  disabled = false,
  buttonLabel = "Cargar Paquete",
  emptyTitle = "Todavía no hay paquetes creados",
  emptyDescription = "Cuando tengas paquetes listos, vas a poder cargarlos acá en un clic.",
  fetcher = fetch,
}: CargarPaqueteButtonProps) {
  const requestIdRef = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [paquetes, setPaquetes] = useState<PaqueteListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSelecting, setIsSelecting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      setIsLoading(false);
      setIsSelecting(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();

    void (async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const response = await fetcher("/api/paquetes", {
          signal: controller.signal,
          headers: {
            accept: "application/json",
          },
        });

        if (!response.ok) {
          throw await readApiError(response);
        }

        const payload = (await response.json()) as PaqueteListItem[];
        if (requestIdRef.current !== requestId) {
          return;
        }

        setPaquetes(payload);
      } catch (error) {
        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        setPaquetes([]);
        setErrorMessage(error instanceof Error ? error.message : "ERROR_GENERICO");
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [fetcher, isOpen]);

  function handleClose(): void {
    if (isSelecting) {
      return;
    }

    setIsOpen(false);
  }

  async function handleSelect(paqueteId: string): Promise<void> {
    try {
      setIsSelecting(paqueteId);
      setErrorMessage(null);

      const response = await fetcher(`/api/paquetes/${paqueteId}/examenes`, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw await readApiError(response);
      }

      const examenes = (await response.json()) as PaqueteExamen[];
      onLoad(examenes);
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ERROR_GENERICO");
    } finally {
      setIsSelecting(null);
    }
  }

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    handleClose();
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {buttonLabel}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={handleBackdropMouseDown}
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-950">Cargar paquete</h2>
                <p className="text-sm text-slate-600">
                  Elegí un paquete y cargamos sus exámenes automáticamente.
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={Boolean(isSelecting)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-6">
              {isLoading ? (
                <div className="space-y-3" role="status" aria-label="Cargando paquetes">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
                    />
                  ))}
                </div>
              ) : errorMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  No pudimos cargar el paquete. {errorMessage}
                </div>
              ) : paquetes.length === 0 ? (
                <EmptyState
                  compact
                  title={emptyTitle}
                  description={emptyDescription}
                  className="border-slate-200 bg-slate-50"
                />
              ) : (
                <ul className="space-y-3">
                  {paquetes.map((paquete) => {
                    const selecting = isSelecting === paquete.id;
                    const cantidadLabel = `${paquete.examenes_count} ${
                      paquete.examenes_count === 1 ? "examen" : "exámenes"
                    }`;

                    return (
                      <li key={paquete.id}>
                        <button
                          type="button"
                          onClick={() => void handleSelect(paquete.id)}
                          disabled={Boolean(isSelecting)}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-950">{paquete.nombre}</p>
                            <p className="text-sm text-slate-600">{cantidadLabel}</p>
                          </div>

                          <span className="text-sm font-medium text-sky-700">
                            {selecting ? "Cargando…" : "Seleccionar"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
