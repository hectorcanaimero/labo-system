"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

import {
  OrdenPipelineKanban,
  OrdenKanbanCard,
  esTransicionOrdenValida,
  type PipelineOrdenCard,
} from "@labo/ui/ordenes/OrdenPipelineKanban";
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
        aria-label={`Orden de ${card.pacienteLabel}. Enter abre el detalle; usá "Mover a…" para cambiar su estado.`}
        role="button"
        tabIndex={0}
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

  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [draggingEstado, setDraggingEstado] = useState<EstadoOrden | null>(null);
  const [draggingCard, setDraggingCard] = useState<PipelineOrdenCard | null>(null);

  const sensors = useSensors(
    // 6 px: por debajo, un clic con la mano temblorosa arrastra sin querer.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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

  async function cambiarEstado(
    ordenId: string,
    origen: EstadoOrden,
    destino: EstadoOrden,
  ): Promise<void> {
    if (busy) return;

    // Optimistic: aplicamos el nuevo estado localmente ANTES del fetch.
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(ordenId, destino);
      return next;
    });

    setBusy(true);
    setPendingId(ordenId);
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
      // La tarjeta ya volvió a su columna; el aviso va por toast.
      notifyError(toHumanError(err));
    } finally {
      setBusy(false);
      setPendingId(null);
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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDraggingEstado(null);
        setDraggingCard(null);
      }}
    >
      <div className="flex h-[calc(100vh-18rem)] min-h-[22rem] flex-col">
      <OrdenPipelineKanban
        items={cards}
        pendingCardId={pendingId}
        renderCard={(card) => (
          <DraggableCardShell
            key={card.id}
            card={card}
            onClick={() => router.push(`/resultados/${card.id}`)}
          />
        )}
        renderColumnBody={(estado, cardsNode) => (
          <DroppableColumnShell estado={estado} activeEstado={draggingEstado}>
            {cardsNode}
          </DroppableColumnShell>
        )}
        onMove={(card, destino) => {
          if (!esTransicionOrdenValida(card.estado, destino)) {
            notifyError(
              new Error(`Transición no permitida: ${card.estado} → ${destino}`),
            );
            return;
          }
          void cambiarEstado(card.id, card.estado, destino);
        }}
      />
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingCard ? (
          <div className="rotate-1 opacity-95 shadow-lg">
            <OrdenKanbanCard card={draggingCard} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
