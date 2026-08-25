import type { ReactNode } from "react";

type ClassValue = string | false | null | undefined;

function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

export interface EmptyStateProps {
  /** Mensaje principal: "Sin pacientes todavía", "No hay resultados", etc. */
  title: string;
  /** Línea de apoyo cálida que explica qué hacer a continuación. */
  description?: string;
  /** Ícono ilustrativo (caller provee el ícono de lucide). */
  icon?: ReactNode;
  /** CTA opcional (ej. botón "Nuevo paciente"). */
  action?: ReactNode;
  /** Variante chica para tarjetas/inline; la grande para páginas. */
  compact?: boolean;
  className?: string;
}

/**
 * Empty state ilustrado con la voz del producto: español VE, cálido y
 * orientado a acción. Se usa en toda lista vacía (pacientes, resultados,
 * presupuestos, paquetes, exámenes, dashboard, config).
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-label={title}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center",
        compact ? "gap-2 py-8" : "gap-3 py-14",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
            compact ? "h-11 w-11" : "h-16 w-16",
          )}
        >
          {icon}
        </div>
      ) : null}

      <div className="space-y-1">
        <h3
          className={cn(
            "font-semibold text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          {title}
        </h3>
        {description ? (
          <p
            className={cn(
              "mx-auto max-w-sm text-muted-foreground",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>

      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
