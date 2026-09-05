"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  /** Etiqueta del total: "pacientes", "eventos", … Por defecto "total". */
  label?: string;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Devuelve las páginas a mostrar con elipsis ("…") cuando hay muchas.
 * Siempre incluye primera, última y una ventana alrededor de la actual.
 */
function pageItems(page: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const window = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => window.add(n));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => window.add(n));
  const sorted = [...window].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

/**
 * Pie de paginación denso (MASTER §8): `3/12 · 280 total` a la izquierda,
 * números de página + anterior/siguiente a la derecha.
 */
export function Pagination({
  page,
  totalPages,
  total,
  label = "total",
  disabled = false,
  onPageChange,
  className,
}: PaginationProps) {
  const last = Math.max(totalPages, 1);
  const current = Math.min(Math.max(page, 1), last);

  return (
    <nav
      aria-label="Paginación"
      className={cn(
        "flex flex-col gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="font-mono tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{current}</span>/{last}
        {" · "}
        <span className="font-medium text-foreground">{total}</span> {label}
      </p>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Página anterior"
          disabled={disabled || current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {pageItems(current, last).map((item, i) =>
          item === "…" ? (
            <span
              key={`gap-${i}`}
              className="inline-flex h-7 w-5 items-center justify-center font-mono text-muted-foreground"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Página ${item}`}
              aria-current={item === current ? "page" : undefined}
              disabled={disabled}
              onClick={() => onPageChange(item)}
              className={cn(
                "h-7 min-w-7 px-1.5 font-mono text-xs tabular-nums",
                item === current
                  ? "bg-accent font-medium text-foreground hover:bg-accent"
                  : "text-muted-foreground",
              )}
            >
              {item}
            </Button>
          ),
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Página siguiente"
          disabled={disabled || current >= last}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </nav>
  );
}
