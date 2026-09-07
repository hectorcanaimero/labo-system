"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  buildColumns,
  initialCollapsed,
  type PipelineColumnDef,
} from "./columns";
import { MoveMenu } from "./MoveMenu";

export interface PipelineBoardProps<E extends string, C extends { id: string; estado: E }> {
  /** Columnas en el orden del proceso; las terminales se marcan y van al final. */
  columns: readonly PipelineColumnDef<E>[];
  cards: readonly C[];
  /** Nombre accesible del tablero completo. */
  label: string;
  /** Filtros y totales; ocupan una sola línea encima del tablero. */
  toolbar?: ReactNode;
  /** Segunda línea del encabezado de la columna (en presupuestos, el total). */
  renderColumnSummary?: (estado: E, cards: readonly C[]) => ReactNode;
  /** La app inyecta acá su shell arrastrable alrededor de la tarjeta. */
  renderCard: (card: C) => ReactNode;
  /** La app inyecta acá su shell de destino de arrastre. */
  renderColumnBody?: (estado: E, cardsNode: ReactNode) => ReactNode;
  /** Destinos válidos de una tarjeta, para el menú "Mover a…". */
  getMoveTargets: (card: C) => readonly E[];
  onMove: (card: C, destino: E) => void;
  /** Acciones del dominio que no son mover (convertir en orden, por ejemplo). */
  getExtraActions?: (card: C) => readonly { label: string; onSelect: () => void }[];
  /** Id de la tarjeta con una operación en curso. */
  pendingCardId?: string | null;
  /** Texto de la columna vacía. */
  emptyColumnLabel?: string;
  cardsLabel?: string;
}

/**
 * Tablero tipo Trello, parametrizado por columnas y tarjeta.
 *
 * Reemplaza a los dos kanban que había —uno en grilla que se partía en filas
 * y otro en fila pero con columnas elásticas—, que dibujaban cajas en vez de
 * un flujo. Las reglas que lo hacen legible son tres y ninguna es negociable
 * por ancho de pantalla:
 *
 *   • una sola fila horizontal, con columnas de ancho fijo y scroll lateral;
 *   • el orden del proceso, de izquierda a derecha;
 *   • los terminales negativos colapsados a la derecha, porque son donde las
 *     tarjetas se estacionan y no etapas por las que pasan.
 *
 * No conoce colores ni dominios: cada flujo declara sus columnas, su color y
 * su tarjeta.
 */
export function PipelineBoard<E extends string, C extends { id: string; estado: E }>({
  columns: columnDefs,
  cards,
  label,
  toolbar,
  renderColumnSummary,
  renderCard,
  renderColumnBody,
  getMoveTargets,
  onMove,
  getExtraActions,
  pendingCardId = null,
  emptyColumnLabel = "Sin tarjetas",
  cardsLabel = "tarjetas",
}: PipelineBoardProps<E, C>) {
  const columns = useMemo(() => buildColumns(columnDefs, cards), [columnDefs, cards]);
  const [collapsed, setCollapsed] = useState<Set<E>>(() => initialCollapsed(columnDefs));

  function toggle(estado: E): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(estado)) next.delete(estado);
      else next.add(estado);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {toolbar ? <div className="shrink-0">{toolbar}</div> : null}

      {/*
        `flex-nowrap` + ancho fijo: partir en filas es exactamente lo que hacía
        ilegible el tablero anterior. En móvil la columna ocupa casi todo el
        ancho y el scroll-snap la encaja de a una.
      */}
      <div
        role="region"
        aria-label={label}
        className="flex min-h-0 flex-1 flex-nowrap snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden pb-2"
      >
        {columns.map((columna) => {
          const isCollapsed = collapsed.has(columna.estado);
          const titulo = columna.label ?? columna.estado;

          if (isCollapsed) {
            return (
              <button
                key={columna.estado}
                type="button"
                onClick={() => toggle(columna.estado)}
                aria-label={`Expandir columna ${titulo} (${columna.count} ${cardsLabel})`}
                className="flex w-14 shrink-0 snap-start flex-col items-center gap-2 rounded-lg border border-border bg-muted/20 py-2 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                <span className={`h-2 w-2 shrink-0 rounded-full ${columna.accentClassName}`} />
                <span className="font-mono text-[11px] font-semibold tabular-nums">
                  {columna.count}
                </span>
                <span
                  className="whitespace-nowrap text-[11px] font-medium tracking-wide"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {titulo}
                </span>
              </button>
            );
          }

          const cardsNode = (
            <div className="flex flex-col gap-1.5">
              {columna.cards.length > 0 ? (
                columna.cards.map((card) => {
                  const targets = getMoveTargets(card);
                  return (
                    <div key={card.id} className="group relative">
                      {renderCard(card)}
                      <div className="absolute right-1 top-1">
                        <MoveMenu
                          cardLabel={cardLabelOf(card)}
                          targets={targets}
                          onMove={(destino) => onMove(card, destino)}
                          extraItems={getExtraActions?.(card)}
                          disabled={pendingCardId === card.id}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[11px] italic text-muted-foreground/70">
                  {emptyColumnLabel}
                </p>
              )}
            </div>
          );

          return (
            <section
              key={columna.estado}
              aria-label={`${titulo}: ${columna.count} ${cardsLabel}`}
              className="flex w-[85vw] shrink-0 snap-start flex-col rounded-lg border border-border bg-muted/20 sm:w-[280px]"
            >
              <header className="sticky top-0 z-10 flex items-start justify-between gap-2 rounded-t-lg border-b border-border bg-muted/60 px-2 py-1.5 backdrop-blur">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${columna.accentClassName}`}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                      {titulo}
                    </span>
                    <span className="shrink-0 rounded-full bg-background px-1.5 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {columna.count}
                    </span>
                  </div>
                  {renderColumnSummary ? (
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {renderColumnSummary(columna.estado, columna.cards)}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => toggle(columna.estado)}
                  aria-label={`Colapsar columna ${titulo}`}
                  className="shrink-0 rounded p-1 text-muted-foreground/70 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </button>
              </header>

              {/* Scroll propio por columna: el tablero no crece hacia abajo. */}
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {renderColumnBody ? (
                  <Fragment>{renderColumnBody(columna.estado, cardsNode)}</Fragment>
                ) : (
                  cardsNode
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Etiqueta legible de la tarjeta para los nombres accesibles del menú. */
function cardLabelOf(card: { id: string } & Record<string, unknown>): string {
  const label = card["pacienteLabel"];
  return typeof label === "string" && label.length > 0 ? label : card.id;
}
