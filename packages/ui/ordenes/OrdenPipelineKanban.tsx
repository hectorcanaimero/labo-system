"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ESTADO_ORDEN, type EstadoOrden } from "@labo/lib/schemas/orden";

import { OrdenEstadoBadge } from "./OrdenEstadoBadge";

// SVG inline: evita agregar `lucide-react` como dep del paquete UI (los otros
// componentes de este paquete no dependen de lucide).
function IconChevron({
  direction,
  className = "h-3.5 w-3.5",
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {direction === "left" ? (
        <>
          <path d="m11 17-5-5 5-5" />
          <path d="m18 17-5-5 5-5" />
        </>
      ) : (
        <>
          <path d="m6 17 5-5-5-5" />
          <path d="m13 17 5-5-5-5" />
        </>
      )}
    </svg>
  );
}

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

export interface PipelineOrdenCard {
  id: string;
  estado: EstadoOrden;
  pacienteLabel: string;
  cedula: string | null;
  fechaMuestraLabel: string;
  examenesCount: number;
  medico: string | null;
}

interface ColumnaConTarjetas {
  estado: EstadoOrden;
  count: number;
  tarjetas: PipelineOrdenCard[];
}

// ────────────────────────────────────────────────────────────────────────────
// Card
// ────────────────────────────────────────────────────────────────────────────

export function OrdenKanbanCard({
  card,
  actionsSlot,
}: {
  card: PipelineOrdenCard;
  actionsSlot?: ReactNode;
}) {
  return (
    <div
      className="group flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent/40"
      title={card.medico ? `Solicita: ${card.medico}` : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-foreground"
          title={card.pacienteLabel}
        >
          {card.pacienteLabel}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          ×{card.examenesCount}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        {card.cedula ? (
          <span className="font-mono tabular-nums">{card.cedula}</span>
        ) : (
          <span className="italic">Sin ficha</span>
        )}
        <span className="tabular-nums">{card.fechaMuestraLabel}</span>
      </div>
      {actionsSlot ? <div className="pt-1">{actionsSlot}</div> : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Persistencia local del set de columnas colapsadas
// ────────────────────────────────────────────────────────────────────────────

const COLLAPSED_STORAGE_KEY = "labo.ordenes.pipeline.collapsed.v1";

function readCollapsed(): Set<EstadoOrden> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((v): v is EstadoOrden =>
        (ESTADO_ORDEN as readonly string[]).includes(v as string),
      ),
    );
  } catch {
    return new Set();
  }
}

function persistCollapsed(set: Set<EstadoOrden>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COLLAPSED_STORAGE_KEY,
      JSON.stringify(Array.from(set)),
    );
  } catch {
    // silencioso — el estado sigue vivo en memoria
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Kanban
// ────────────────────────────────────────────────────────────────────────────

export interface OrdenPipelineKanbanProps {
  items: readonly PipelineOrdenCard[];
  onCardClick?: (card: PipelineOrdenCard) => void;
  renderCard?: (card: PipelineOrdenCard) => ReactNode;
  renderColumnBody?: (estado: EstadoOrden, cardsNode: ReactNode) => ReactNode;
}

export function OrdenPipelineKanban({
  items,
  onCardClick,
  renderCard,
  renderColumnBody,
}: OrdenPipelineKanbanProps) {
  const columns = useMemo<ColumnaConTarjetas[]>(() => {
    return ESTADO_ORDEN.map((estado) => {
      const tarjetas = items.filter((card) => card.estado === estado);
      return { estado, count: tarjetas.length, tarjetas };
    });
  }, [items]);

  // Cargamos el set persistido después del mount para no romper la
  // hidratación (localStorage no existe en SSR).
  const [collapsed, setCollapsed] = useState<Set<EstadoOrden>>(() => new Set());
  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  function toggle(estado: EstadoOrden): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(estado)) next.delete(estado);
      else next.add(estado);
      persistCollapsed(next);
      return next;
    });
  }

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      role="region"
      aria-label="Pipeline operativo de órdenes de laboratorio"
    >
      {columns.map((columna) => {
        const isCollapsed = collapsed.has(columna.estado);

        // Colapsada: columna angosta con badge vertical + count. Un solo click
        // en cualquier parte del track la vuelve a expandir.
        if (isCollapsed) {
          return (
            <button
              key={columna.estado}
              type="button"
              onClick={() => toggle(columna.estado)}
              aria-label={`Expandir columna ${columna.estado} (${columna.count} órdenes)`}
              className="group flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-muted/20 py-2 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
            >
              <IconChevron direction="right" />
              <span className="font-mono text-[11px] font-semibold tabular-nums">
                {columna.count}
              </span>
              <span
                className="whitespace-nowrap text-[11px] font-medium tracking-wide"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                {columna.estado}
              </span>
            </button>
          );
        }

        // Expandida: columna full con cards.
        const cardsNode = (
          <div className="flex flex-col gap-1.5">
            {columna.tarjetas.length > 0 ? (
              columna.tarjetas.map((card) =>
                renderCard ? (
                  <Fragment key={card.id}>{renderCard(card)}</Fragment>
                ) : (
                  <button
                    key={card.id}
                    type="button"
                    className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    onClick={() => onCardClick?.(card)}
                    aria-label={`Acciones para orden de ${card.pacienteLabel}`}
                  >
                    <OrdenKanbanCard card={card} />
                  </button>
                ),
              )
            ) : (
              <p className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[11px] italic text-muted-foreground/70">
                —
              </p>
            )}
          </div>
        );

        return (
          <section
            key={columna.estado}
            aria-label={`${columna.estado}: ${columna.count} órdenes`}
            className="flex min-h-[8rem] w-64 shrink-0 flex-col rounded-lg border border-border bg-muted/20"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg border-b border-border bg-muted/60 px-2 py-1.5 backdrop-blur">
              <div className="flex min-w-0 items-center gap-1.5">
                <OrdenEstadoBadge estado={columna.estado} />
                <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {columna.count}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggle(columna.estado)}
                aria-label={`Colapsar columna ${columna.estado}`}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-background hover:text-foreground"
              >
                <IconChevron direction="left" />
              </button>
            </header>
            <div className="flex-1 p-1.5">
              {renderColumnBody
                ? renderColumnBody(columna.estado, cardsNode)
                : cardsNode}
            </div>
          </section>
        );
      })}
    </div>
  );
}
