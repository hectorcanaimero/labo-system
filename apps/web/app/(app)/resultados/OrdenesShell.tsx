"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ESTADO_ORDEN, type EstadoOrden } from "@labo/lib/schemas/orden";

import {
  OrdenesPipelineSection,
  type OrdenPipelineItem,
} from "./OrdenesPipelineSection";
import { ResultadosList, type PaginatedResultadosResponse } from "./ResultadosList";

type Vista = "kanban" | "tabla";

interface OrdenesShellProps {
  pipelineItems: OrdenPipelineItem[];
  initialTablaData: PaginatedResultadosResponse;
  tablaPageSize: number;
}

export function OrdenesShell({
  pipelineItems,
  initialTablaData,
  tablaPageSize,
}: OrdenesShellProps) {
  const [vista, setVista] = useState<Vista>("kanban");

  // Contadores por estado — para leerlos de un vistazo en el header.
  const counts = useMemo(() => {
    const acc: Record<EstadoOrden, number> = {
      Registrada: 0,
      "Muestra tomada": 0,
      "En proceso": 0,
      Validando: 0,
      Entregada: 0,
      Anulada: 0,
    };
    for (const item of pipelineItems) acc[item.estado]++;
    return acc;
  }, [pipelineItems]);

  const total = pipelineItems.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Barra superior compacta: título · totales · toggle · CTA */}
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Órdenes de laboratorio
            </h1>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {total}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pipeline operativo — clic en una tarjeta para avanzar de estado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Kanban ↔ Tabla */}
          <div
            role="tablist"
            aria-label="Cambiar vista"
            className="inline-flex overflow-hidden rounded-md border border-border bg-background"
          >
            <button
              type="button"
              role="tab"
              aria-selected={vista === "kanban"}
              onClick={() => setVista("kanban")}
              className={`inline-flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors ${
                vista === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === "tabla"}
              onClick={() => setVista("tabla")}
              className={`inline-flex h-8 items-center gap-1.5 border-l border-border px-3 text-xs font-medium transition-colors ${
                vista === "tabla"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Tabla
            </button>
          </div>

          <Link href="/resultados/nuevo">
            <Button type="button" size="sm" className="h-8">
              <Plus className="h-3.5 w-3.5" />
              Nueva orden
            </Button>
          </Link>
        </div>
      </div>

      {/* Barra de conteos por estado — siempre visible, hace de mini-leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {ESTADO_ORDEN.map((estado) => (
          <div key={estado} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[estado]}`}
              aria-hidden
            />
            <span className="text-muted-foreground">{estado}</span>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {counts[estado]}
            </span>
          </div>
        ))}
      </div>

      {/* Contenido */}
      {vista === "kanban" ? (
        <OrdenesPipelineSection items={pipelineItems} />
      ) : (
        <ResultadosList
          initialData={initialTablaData}
          pageSize={tablaPageSize}
        />
      )}
    </div>
  );
}

const DOT_COLOR: Readonly<Record<EstadoOrden, string>> = {
  Registrada: "bg-zinc-400",
  "Muestra tomada": "bg-sky-500",
  "En proceso": "bg-cyan-500",
  Validando: "bg-violet-500",
  Entregada: "bg-emerald-500",
  Anulada: "bg-red-500",
};
