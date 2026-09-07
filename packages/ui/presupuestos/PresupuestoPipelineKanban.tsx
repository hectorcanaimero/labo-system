"use client";

import { useMemo, type ReactNode } from "react";
import { formatUsd } from "@labo/lib/bs-format";
import {
  ESTADO_PRESUPUESTO,
  type EstadoPresupuesto,
} from "@labo/lib/schemas/presupuesto";

import { PipelineBoard, moveTargets, type PipelineColumnDef } from "../pipeline";

/**
 * Espejo front de `TRANSICIONES_ESTADO` (packages/db/repos/presupuestos.ts).
 *
 * Fuente de verdad: el backend valida de nuevo en `cambiarEstado`; esta copia
 * sólo existe para feedback inmediato en la UI (deshabilitar drops inválidos).
 * `Cancelado` y `Cerrado` son terminales.
 */
export const TRANSICIONES_ESTADO_UI: Readonly<
  Record<EstadoPresupuesto, readonly EstadoPresupuesto[]>
> = {
  Borrador: ["Enviado", "Aprobado", "Cancelado"],
  Enviado: ["Aprobado", "Rechazado", "Cancelado"],
  Aprobado: ["Cerrado", "Cancelado"],
  Rechazado: ["Borrador", "Cancelado"],
  Cancelado: [],
  Cerrado: [],
};

export function esTransicionValida(
  estadoActual: EstadoPresupuesto,
  objetivo: EstadoPresupuesto,
): boolean {
  return (
    estadoActual !== objetivo &&
    TRANSICIONES_ESTADO_UI[estadoActual].includes(objetivo)
  );
}

/**
 * Color por etapa. Mismo criterio que `PresupuestoEstadoBadge`, que sigue
 * mostrándose en la vista de tabla: si el punto de la columna no coincidiera
 * con el badge de la tabla, el mismo estado tendría dos colores en la misma
 * pantalla.
 */
const PUNTO: Readonly<Record<EstadoPresupuesto, string>> = {
  Borrador: "bg-amber-500",
  Enviado: "bg-sky-500",
  Aprobado: "bg-emerald-500",
  Cerrado: "bg-violet-500",
  Rechazado: "bg-red-500",
  Cancelado: "bg-zinc-400",
};

const BORDE: Readonly<Record<EstadoPresupuesto, string>> = {
  Borrador: "border-l-amber-500",
  Enviado: "border-l-sky-500",
  Aprobado: "border-l-emerald-500",
  Cerrado: "border-l-violet-500",
  Rechazado: "border-l-red-500",
  Cancelado: "border-l-zinc-400",
};

/** Orden del proceso comercial; los negativos al final y colapsados. */
export const COLUMNAS_PRESUPUESTO: readonly PipelineColumnDef<EstadoPresupuesto>[] = [
  { estado: "Borrador", accentClassName: PUNTO.Borrador },
  { estado: "Enviado", accentClassName: PUNTO.Enviado },
  { estado: "Aprobado", accentClassName: PUNTO.Aprobado },
  { estado: "Cerrado", accentClassName: PUNTO.Cerrado },
  { estado: "Rechazado", accentClassName: PUNTO.Rechazado, terminal: true },
  { estado: "Cancelado", accentClassName: PUNTO.Cancelado, terminal: true },
];

export interface PipelinePresupuestoCard {
  id: string;
  numeroCorrelativo: number;
  numeroLegible: string;
  estado: EstadoPresupuesto;
  pacienteLabel: string;
  fechaLabel: string;
  totalUsd: number;
  totalBs: number;
}

export interface PipelineColumnaTotales {
  estado: EstadoPresupuesto;
  count: number;
  totalUsd: number;
  totalBs: number;
}

/**
 * Tarjeta compacta: paciente arriba, número y fecha abajo, monto a la derecha.
 *
 * Sin badge de estado — lo dice la columna en la que está, y repetirlo era
 * ruido en un espacio de 280 px.
 */
export function PresupuestoKanbanCard({
  card,
}: {
  card: PipelinePresupuestoCard;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-md border border-l-[3px] border-border bg-card px-2.5 py-2 pr-7 transition-shadow hover:shadow-md ${BORDE[card.estado]}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-foreground"
          title={card.pacienteLabel}
        >
          {card.pacienteLabel}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
          $ {formatUsd(card.totalUsd)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="truncate">{card.numeroLegible}</span>
        <span className="shrink-0 tabular-nums">{card.fechaLabel}</span>
      </div>
    </div>
  );
}

export interface PresupuestoPipelineKanbanProps {
  items: readonly PipelinePresupuestoCard[];
  toolbar?: ReactNode;
  /** Envuelve cada tarjeta; la app inyecta su shell draggable de dnd-kit. */
  renderCard: (card: PipelinePresupuestoCard) => ReactNode;
  /** Envuelve el cuerpo de cada columna con el shell droppable de la app. */
  renderColumnBody?: (
    estado: EstadoPresupuesto,
    cardsNode: ReactNode,
  ) => ReactNode;
  onMove: (card: PipelinePresupuestoCard, destino: EstadoPresupuesto) => void;
  getExtraActions?: (
    card: PipelinePresupuestoCard,
  ) => readonly { label: string; onSelect: () => void }[];
  pendingCardId?: string | null;
}

export function PresupuestoPipelineKanban({
  items,
  toolbar,
  renderCard,
  renderColumnBody,
  onMove,
  getExtraActions,
  pendingCardId,
}: PresupuestoPipelineKanbanProps) {
  const totalesPorEstado = useMemo(() => {
    const acc = new Map<EstadoPresupuesto, number>();
    for (const estado of ESTADO_PRESUPUESTO) acc.set(estado, 0);
    for (const card of items) {
      acc.set(card.estado, (acc.get(card.estado) ?? 0) + card.totalUsd);
    }
    return acc;
  }, [items]);

  return (
    <PipelineBoard
      label="Pipeline comercial de presupuestos"
      columns={COLUMNAS_PRESUPUESTO}
      cards={items}
      cardsLabel="presupuestos"
      emptyColumnLabel="Sin presupuestos"
      toolbar={toolbar}
      renderCard={renderCard}
      renderColumnBody={renderColumnBody}
      renderColumnSummary={(estado) => `$ ${formatUsd(totalesPorEstado.get(estado) ?? 0)}`}
      getMoveTargets={(card) =>
        moveTargets(COLUMNAS_PRESUPUESTO, card.estado, TRANSICIONES_ESTADO_UI)
      }
      onMove={onMove}
      getExtraActions={getExtraActions}
      pendingCardId={pendingCardId}
    />
  );
}
