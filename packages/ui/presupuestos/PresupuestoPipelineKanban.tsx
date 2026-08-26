"use client";

import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import { formatBs, formatUsd } from "@labo/lib/bs-format";
import {
  ESTADO_PRESUPUESTO,
  type EstadoPresupuesto,
} from "@labo/lib/schemas/presupuesto";

import { PresupuestoEstadoBadge } from "./PresupuestoEstadoBadge";

/**
 * Espejo front de `TRANSICIONES_ESTADO` (packages/db/repos/presupuestos.ts).
 *
 * Fuente de verdad: el backend valida de nuevo en `cambiarEstado`; esta copia
 * sólo existe para feedback inmediato en la UI (deshabilitar drops inválidos).
 * `Cancelado` y `Convertido` son terminales.
 */
export const TRANSICIONES_ESTADO_UI: Readonly<
  Record<EstadoPresupuesto, readonly EstadoPresupuesto[]>
> = {
  Borrador: ["Enviado", "Cancelado"],
  Enviado: ["Aprobado", "Rechazado", "Cancelado"],
  Aprobado: ["Convertido", "Cancelado"],
  Rechazado: ["Borrador", "Cancelado"],
  Cancelado: [],
  Convertido: [],
};

export function esTransicionValida(
  estadoActual: EstadoPresupuesto,
  objetivo: EstadoPresupuesto,
): boolean {
  return estadoActual !== objetivo && TRANSICIONES_ESTADO_UI[estadoActual].includes(objetivo);
}

export interface PipelinePresupuestoCard {
  id: string;
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

interface ColumnaConTarjetas extends PipelineColumnaTotales {
  tarjetas: PipelinePresupuestoCard[];
}

export function PresupuestoKanbanCard({
  card,
  actionsSlot,
}: {
  card: PipelinePresupuestoCard;
  actionsSlot?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={card.pacienteLabel}>
          {card.pacienteLabel}
        </span>
        <PresupuestoEstadoBadge estado={card.estado} />
      </div>
      <p className="text-xs text-muted-foreground">{card.fechaLabel}</p>
      <div className="flex items-center gap-2 border-t border-border/60 pt-2">
        <span className="font-mono text-xs text-muted-foreground">$ {formatUsd(card.totalUsd)}</span>
        <span className="font-mono text-xs text-muted-foreground">Bs {formatBs(card.totalBs)}</span>
        {actionsSlot ? <span className="ml-auto shrink-0">{actionsSlot}</span> : null}
      </div>
    </div>
  );
}

export interface PresupuestoPipelineKanbanProps {
  items: readonly PipelinePresupuestoCard[];
  onCardClick?: (card: PipelinePresupuestoCard) => void;
  /**
   * Envuelve cada tarjeta; la app inyecta su shell draggable de dnd-kit.
   * Si falta, se usa la tarjeta por defecto (clickable vía `onCardClick`).
   */
  renderCard?: (card: PipelinePresupuestoCard) => ReactNode;
  /**
   * Envuelve el cuerpo de cada columna; la app inyecta su shell droppable
   * de dnd-kit recibiendo las tarjetas ya renderizadas como segundo parámetro.
   */
  renderColumnBody?: (estado: EstadoPresupuesto, cardsNode: ReactNode) => ReactNode;
}

export function PresupuestoPipelineKanban({
  items,
  onCardClick,
  renderCard,
  renderColumnBody,
}: PresupuestoPipelineKanbanProps) {
  const columns = useMemo<ColumnaConTarjetas[]>(() => {
    return ESTADO_PRESUPUESTO.map((estado) => {
      const tarjetas = items.filter((card) => card.estado === estado);
      return {
        estado,
        count: tarjetas.length,
        totalUsd: tarjetas.reduce((sum, card) => sum + card.totalUsd, 0),
        totalBs: tarjetas.reduce((sum, card) => sum + card.totalBs, 0),
        tarjetas,
      };
    });
  }, [items]);

  const general = useMemo(
    () =>
      columns.reduce(
        (acc, columna) => ({
          count: acc.count + columna.count,
          totalUsd: acc.totalUsd + columna.totalUsd,
          totalBs: acc.totalBs + columna.totalBs,
        }),
        { count: 0, totalUsd: 0, totalBs: 0 },
      ),
    [columns],
  );

  return (
    <div className="flex flex-col gap-3" role="region" aria-label="Pipeline comercial de presupuestos">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <span className="font-medium text-foreground">{general.count} presupuestos</span>
        <span className="font-mono text-foreground">$ {formatUsd(general.totalUsd)}</span>
        <span className="font-mono text-foreground">Bs {formatBs(general.totalBs)}</span>
        <span className="text-xs text-muted-foreground">Totales del pipeline</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {columns.map((columna) => {
          const cardsNode = (
            <div className="flex flex-col gap-2">
              {columna.tarjetas.length > 0 ? (
                columna.tarjetas.map((card) =>
                  renderCard ? (
                    <Fragment key={card.id}>{renderCard(card)}</Fragment>
                  ) : (
                    <button
                      key={card.id}
                      type="button"
                      className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => onCardClick?.(card)}
                      aria-label={`Acciones para presupuesto de ${card.pacienteLabel}`}
                    >
                      <PresupuestoKanbanCard card={card} />
                    </button>
                  ),
                )
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  Sin presupuestos
                </p>
              )}
            </div>
          );

          return (
            <section
              key={columna.estado}
              aria-label={`${columna.estado}: ${columna.count} presupuestos`}
              className="flex flex-col rounded-xl border border-border bg-muted/20"
            >
              <header className="flex flex-col gap-1 border-b border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <PresupuestoEstadoBadge estado={columna.estado} />
                  <span className="text-xs font-semibold text-muted-foreground">{columna.count}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                  <span>$ {formatUsd(columna.totalUsd)}</span>
                  <span>Bs {formatBs(columna.totalBs)}</span>
                </div>
              </header>
              <div className="min-h-[6rem] flex-1 p-2">
                {renderColumnBody ? renderColumnBody(columna.estado, cardsNode) : cardsNode}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
