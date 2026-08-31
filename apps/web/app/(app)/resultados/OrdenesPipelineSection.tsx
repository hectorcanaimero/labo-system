"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Eye, Loader2, Stethoscope, User } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OrdenPipelineKanban,
  OrdenKanbanCard,
  TRANSICIONES_ESTADO_ORDEN_UI,
  esTransicionOrdenValida,
  type PipelineOrdenCard,
} from "@labo/ui/ordenes/OrdenPipelineKanban";
import { OrdenEstadoBadge } from "@labo/ui/ordenes/OrdenEstadoBadge";
import { toHumanError } from "@labo/lib/error-messages";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";
import type { EstadoOrden } from "@labo/lib/schemas/orden";

export interface OrdenPipelineItem {
  id: string;
  estado: EstadoOrden;
  paciente_nombre: string;
  paciente_apellido: string;
  paciente_cedula: string | null;
  fecha_muestra: string;
  fecha_resultado: string | null;
  medico_solicitante: string | null;
  examenes_count: number;
}

interface OrdenesPipelineSectionProps {
  items: OrdenPipelineItem[];
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-VE", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Draggable card shell
// ────────────────────────────────────────────────────────────────────────────

function DraggableCardShell({
  card,
  onClick,
}: {
  card: PipelineOrdenCard;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({
      id: `card:${card.id}`,
      data: { cardId: card.id, estadoOrigen: card.estado },
    });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-40" : undefined}
    >
      <div
        {...listeners}
        {...attributes}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        aria-label={`Acciones para orden de ${card.pacienteLabel}`}
        className="cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <OrdenKanbanCard card={card} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Droppable column shell
// ────────────────────────────────────────────────────────────────────────────

function DroppableColumnShell({
  estado,
  activeEstado,
  children,
}: {
  estado: EstadoOrden;
  activeEstado: EstadoOrden | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${estado}`,
    data: { estadoDestino: estado },
  });

  let dropStyles = "";
  if (activeEstado && activeEstado !== estado) {
    const valid = esTransicionOrdenValida(activeEstado, estado);
    if (valid) {
      dropStyles = isOver
        ? "ring-2 ring-emerald-500 bg-emerald-500/10"
        : "ring-1 ring-emerald-500/50 bg-emerald-500/5";
    } else {
      dropStyles = isOver
        ? "ring-2 ring-destructive/60 bg-destructive/10"
        : "opacity-50";
    }
  }

  return (
    <div ref={setNodeRef} className={`rounded-lg transition-all ${dropStyles}`}>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Section principal — con optimistic updates
// ────────────────────────────────────────────────────────────────────────────

export function OrdenesPipelineSection({ items }: OrdenesPipelineSectionProps) {
  const router = useRouter();

  // Overrides locales para dar feedback inmediato tras drop / cambio en modal.
  // El backend puede tardar; mantenemos el nuevo estado en local hasta que
  // `router.refresh()` traiga los items actualizados (y borramos el override).
  const [overrides, setOverrides] = useState<Map<string, EstadoOrden>>(
    () => new Map(),
  );

  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draggingEstado, setDraggingEstado] = useState<EstadoOrden | null>(null);
  const [draggingCard, setDraggingCard] = useState<PipelineOrdenCard | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Aplicamos overrides sobre los items del server.
  const mergedItems = useMemo<OrdenPipelineItem[]>(
    () =>
      items.map((r) => {
        const ov = overrides.get(r.id);
        return ov ? { ...r, estado: ov } : r;
      }),
    [items, overrides],
  );

  // Limpiamos overrides que ya se reflejan en items del server (el refresh
  // llegó y trae el mismo estado que teníamos localmente).
  useMemo(() => {
    if (overrides.size === 0) return;
    let changed = false;
    const next = new Map(overrides);
    for (const [id, estado] of overrides) {
      const server = items.find((i) => i.id === id);
      if (server && server.estado === estado) {
        next.delete(id);
        changed = true;
      }
    }
    if (changed) setOverrides(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const cards = useMemo<PipelineOrdenCard[]>(
    () =>
      mergedItems.map((r) => ({
        id: r.id,
        estado: r.estado,
        pacienteLabel: `${r.paciente_nombre} ${r.paciente_apellido}`.trim(),
        cedula: r.paciente_cedula,
        fechaMuestraLabel: formatDate(r.fecha_muestra),
        examenesCount: r.examenes_count,
        medico: r.medico_solicitante,
      })),
    [mergedItems],
  );

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const activeCard = activeCardId ? cardsById.get(activeCardId) ?? null : null;
  const activeItem = activeCardId
    ? mergedItems.find((i) => i.id === activeCardId) ?? null
    : null;

  const destinos = useMemo<EstadoOrden[]>(
    () => (activeCard ? [...TRANSICIONES_ESTADO_ORDEN_UI[activeCard.estado]] : []),
    [activeCard],
  );

  async function cambiarEstado(
    ordenId: string,
    origen: EstadoOrden,
    destino: EstadoOrden,
    { fromModal = false }: { fromModal?: boolean } = {},
  ): Promise<void> {
    if (busy) return;

    // Optimistic: aplicamos el nuevo estado localmente ANTES del fetch.
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(ordenId, destino);
      return next;
    });

    if (fromModal) setActiveCardId(null);

    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/resultados/${ordenId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ estado: destino }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `REQUEST_FAILED_${res.status}`);
      }
      notifySuccess(`Orden movida a ${destino}`);
      router.refresh();
    } catch (err) {
      // Revertimos el override: la card vuelve a su estado original.
      setOverrides((prev) => {
        const next = new Map(prev);
        // Guardamos el estado original explícitamente, así aunque el items del
        // server aún no llegue, se muestra en el lugar correcto.
        next.set(ordenId, origen);
        // Y programamos limpieza en el próximo tick (los items ya reflejan
        // el origen, así que el useMemo de arriba lo limpiará).
        setTimeout(() => {
          setOverrides((p) => {
            const n = new Map(p);
            n.delete(ordenId);
            return n;
          });
        }, 0);
        return next;
      });
      const msg = toHumanError(err);
      if (fromModal) {
        setErrorMsg(msg);
        setActiveCardId(ordenId); // reabrimos para mostrar el error
      } else {
        notifyError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleDragStart(event: DragStartEvent): void {
    const data = event.active.data.current as
      | { cardId: string; estadoOrigen: EstadoOrden }
      | undefined;
    if (!data) return;
    setDraggingEstado(data.estadoOrigen);
    setDraggingCard(cardsById.get(data.cardId) ?? null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setDraggingEstado(null);
    setDraggingCard(null);

    const activeData = event.active.data.current as
      | { cardId: string; estadoOrigen: EstadoOrden }
      | undefined;
    const overData = event.over?.data.current as
      | { estadoDestino: EstadoOrden }
      | undefined;
    if (!activeData || !overData) return;

    const { cardId, estadoOrigen } = activeData;
    const { estadoDestino } = overData;
    if (estadoOrigen === estadoDestino) return;
    if (!esTransicionOrdenValida(estadoOrigen, estadoDestino)) {
      notifyError(
        `Transición no permitida: ${estadoOrigen} → ${estadoDestino}`,
      );
      return;
    }
    void cambiarEstado(cardId, estadoOrigen, estadoDestino);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setDraggingEstado(null);
          setDraggingCard(null);
        }}
      >
        <OrdenPipelineKanban
          items={cards}
          renderCard={(card) => (
            <DraggableCardShell
              key={card.id}
              card={card}
              onClick={() => setActiveCardId(card.id)}
            />
          )}
          renderColumnBody={(estado, cardsNode) => (
            <DroppableColumnShell estado={estado} activeEstado={draggingEstado}>
              {cardsNode}
            </DroppableColumnShell>
          )}
        />

        <DragOverlay dropAnimation={null}>
          {draggingCard ? (
            <div className="rotate-1 opacity-95 shadow-lg">
              <OrdenKanbanCard card={draggingCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog
        open={!!activeCard}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setActiveCardId(null);
            setErrorMsg(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          {activeCard && activeItem ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{activeCard.pacienteLabel}</span>
                  <OrdenEstadoBadge estado={activeCard.estado} />
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Movés la tarjeta arrastrándola entre columnas, o usá los botones
                  de abajo.
                </DialogDescription>
              </DialogHeader>

              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <dt className="text-muted-foreground">Cédula:</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {activeItem.paciente_cedula || "—"}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <dt className="text-muted-foreground">Solicita:</dt>
                  <dd className="truncate text-foreground">
                    {activeItem.medico_solicitante || "—"}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <dt className="text-muted-foreground">Muestra:</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatDate(activeItem.fecha_muestra)}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <dt className="text-muted-foreground">Entrega:</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatDate(activeItem.fecha_resultado)}
                  </dd>
                </div>
                <div className="col-span-2 flex items-center gap-1.5">
                  <dt className="text-muted-foreground">Exámenes:</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {activeItem.examenes_count}
                  </dd>
                </div>
              </dl>

              {errorMsg ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {errorMsg}
                </p>
              ) : null}

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Cambiar estado
                </p>
                {destinos.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                    Estado terminal — no admite más transiciones.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {destinos.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={d === "Anulada" ? "outline" : "default"}
                        className={
                          d === "Anulada"
                            ? "h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                            : "h-8"
                        }
                        disabled={busy}
                        onClick={() =>
                          void cambiarEstado(activeCard.id, activeCard.estado, d, {
                            fromModal: true,
                          })
                        }
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        → {d}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                <Link href={`/resultados/${activeCard.id}`}>
                  <Button type="button" variant="outline" size="sm" className="h-8">
                    <Eye className="h-3.5 w-3.5" />
                    Ver detalle
                  </Button>
                </Link>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
