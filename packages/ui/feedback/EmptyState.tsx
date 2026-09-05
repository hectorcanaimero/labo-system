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
        "flex flex-col items-center justify-center rounded-md border border-dashed border-border px-6 text-center",
        compact ? "gap-2 py-6" : "gap-2.5 py-10",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground [&_svg]:h-4 [&_svg]:w-4",
            compact ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          {icon}
        </div>
      ) : null}

      <div className="space-y-1">
        <h3
          className={cn(
            "font-semibold text-foreground",
            compact ? "text-sm" : "text-sm",
          )}
        >
          {title}
        </h3>
        {description ? (
          <p
            className={cn(
              "mx-auto max-w-sm text-muted-foreground",
              "text-xs",
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
