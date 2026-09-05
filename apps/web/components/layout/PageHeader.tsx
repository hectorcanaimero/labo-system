import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: ReactNode;
  /** Dato en mono al lado del título: total, cédula, correlativo. */
  count?: ReactNode;
  /** Elementos extra en la fila del título (badges, etc.). */
  meta?: ReactNode;
  description?: ReactNode;
  /** Botones a la derecha. */
  actions?: ReactNode;
  /** Link de retorno a la lista padre. */
  back?: { href: string; label: string };
  className?: string;
}

/**
 * Header de página compacto (MASTER §3.3): título + dato mono + subtítulo
 * de una línea, acciones alineadas a la derecha. Único punto donde se define
 * el estilo de títulos de la app.
 */
export function PageHeader({
  title,
  count,
  meta,
  description,
  actions,
  back,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-2 border-b border-border pb-3", className)}>
      {back ? (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {count !== undefined && count !== null ? (
              <span className="font-mono text-sm tabular-nums text-muted-foreground">{count}</span>
            ) : null}
            {meta}
          </div>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
