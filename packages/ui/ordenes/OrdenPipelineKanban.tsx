"use client";

import type { ReactNode } from "react";

import { type EstadoOrden } from "@labo/lib/schemas/orden";

import { PipelineBoard, moveTargets, type PipelineColumnDef } from "../pipeline";

/**
 * Espejo front de `TRANSICIONES_ESTADO_ORDEN` (backend). Solo para feedback
 * visual inmediato — la validación real vive en el server.
 */
export const TRANSICIONES_ESTADO_ORDEN_UI: Readonly<
  Record<EstadoOrden, readonly EstadoOrden[]>
> = {
  Registrada: ["Muestra tomada", "Anulada"],
  "Muestra tomada": ["En proceso", "Registrada", "Anulada"],
  "En proceso": ["Validando", "Muestra tomada", "Anulada"],
  Validando: ["Entregada", "En proceso", "Anulada"],
  Entregada: ["Anulada"],
  Anulada: [],
};

export function esTransicionOrdenValida(
  estadoActual: EstadoOrden,
  objetivo: EstadoOrden,
): boolean {
  return (
    estadoActual !== objetivo &&
    TRANSICIONES_ESTADO_ORDEN_UI[estadoActual].includes(objetivo)
  );
}

/**
 * Color por etapa, con el mismo criterio que `OrdenEstadoBadge`, que sigue
 * usándose en el detalle y en el diálogo: un estado no puede tener dos
 * colores según dónde se lo mire.
 */
const PUNTO: Readonly<Record<EstadoOrden, string>> = {
  Registrada: "bg-zinc-400",
  "Muestra tomada": "bg-sky-500",
  "En proceso": "bg-cyan-500",
  Validando: "bg-violet-500",
  Entregada: "bg-emerald-500",
  Anulada: "bg-red-500",
};

const BORDE: Readonly<Record<EstadoOrden, string>> = {
  Registrada: "border-l-zinc-400",
  "Muestra tomada": "border-l-sky-500",
  "En proceso": "border-l-cyan-500",
  Validando: "border-l-violet-500",
  Entregada: "border-l-emerald-500",
  Anulada: "border-l-red-500",
};

/** Orden del proceso operativo; Anulada al final y colapsada. */
export const COLUMNAS_ORDEN: readonly PipelineColumnDef<EstadoOrden>[] = [
  { estado: "Registrada", accentClassName: PUNTO.Registrada },
  { estado: "Muestra tomada", accentClassName: PUNTO["Muestra tomada"] },
  { estado: "En proceso", accentClassName: PUNTO["En proceso"] },
  { estado: "Validando", accentClassName: PUNTO.Validando },
  { estado: "Entregada", accentClassName: PUNTO.Entregada },
  { estado: "Anulada", accentClassName: PUNTO.Anulada, terminal: true },
];

export interface PipelineOrdenCard {
  id: string;
  estado: EstadoOrden;
  pacienteLabel: string;
  cedula: string | null;
  fechaMuestraLabel: string;
  examenesCount: number;
  medico: string | null;
}

/**
 * Tarjeta compacta: paciente arriba, cédula y fecha abajo, cantidad de
 * exámenes a la derecha. Sin badge de estado — lo dice la columna.
 */
export function OrdenKanbanCard({ card }: { card: PipelineOrdenCard }) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-md border border-l-[3px] border-border bg-card px-2.5 py-2 pr-7 transition-shadow hover:shadow-md ${BORDE[card.estado]}`}
      title={card.medico ? `Solicita: ${card.medico}` : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-foreground"
          title={card.pacienteLabel}
        >
          {card.pacienteLabel}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          ×{card.examenesCount}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        {card.cedula ? (
          <span className="truncate tabular-nums">{card.cedula}</span>
        ) : (
          <span className="truncate italic">Sin ficha</span>
        )}
        <span className="shrink-0 tabular-nums">{card.fechaMuestraLabel}</span>
      </div>
    </div>
  );
}

export interface OrdenPipelineKanbanProps {
  items: readonly PipelineOrdenCard[];
  toolbar?: ReactNode;
  renderCard: (card: PipelineOrdenCard) => ReactNode;
  renderColumnBody?: (estado: EstadoOrden, cardsNode: ReactNode) => ReactNode;
  onMove: (card: PipelineOrdenCard, destino: EstadoOrden) => void;
  getExtraActions?: (
    card: PipelineOrdenCard,
  ) => readonly { label: string; onSelect: () => void }[];
  pendingCardId?: string | null;
}

export function OrdenPipelineKanban({
  items,
  toolbar,
  renderCard,
  renderColumnBody,
  onMove,
  getExtraActions,
  pendingCardId,
}: OrdenPipelineKanbanProps) {
  return (
    <PipelineBoard
      label="Pipeline operativo de órdenes de laboratorio"
      columns={COLUMNAS_ORDEN}
      cards={items}
      cardsLabel="órdenes"
      emptyColumnLabel="Sin órdenes"
      toolbar={toolbar}
      renderCard={renderCard}
      renderColumnBody={renderColumnBody}
      getMoveTargets={(card) =>
        moveTargets(COLUMNAS_ORDEN, card.estado, TRANSICIONES_ESTADO_ORDEN_UI)
      }
      onMove={onMove}
      getExtraActions={getExtraActions}
      pendingCardId={pendingCardId}
    />
  );
}
