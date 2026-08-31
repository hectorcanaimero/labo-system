import type { EstadoOrden } from "@labo/lib/schemas/orden";

export interface OrdenEstadoBadgeProps {
  estado: EstadoOrden;
  className?: string;
}

/**
 * Colores por etapa del pipeline operativo. Escala visual: gris → azul → cian
 * → púrpura → verde (éxito) / rojo (anulada).
 */
const STYLES: Readonly<Record<EstadoOrden, string>> = {
  Registrada: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  "Muestra tomada": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "En proceso": "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  Validando: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  Entregada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  Anulada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function OrdenEstadoBadge({ estado, className }: OrdenEstadoBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium ${STYLES[estado]}${className ? ` ${className}` : ""}`}
    >
      {estado}
    </span>
  );
}
