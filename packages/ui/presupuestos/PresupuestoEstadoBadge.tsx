import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";

export interface PresupuestoEstadoBadgeProps {
  estado: EstadoPresupuesto;
  className?: string;
}

/** Estilos visuales diferenciados por etapa del pipeline comercial. */
const STYLES: Readonly<Record<EstadoPresupuesto, string>> = {
  Borrador: "bg-amber-100 text-amber-800",
  Enviado: "bg-sky-100 text-sky-800",
  Aprobado: "bg-emerald-100 text-emerald-800",
  Rechazado: "bg-red-100 text-red-800",
  Cancelado: "bg-zinc-200 text-zinc-700",
  Convertido: "bg-violet-100 text-violet-800",
};

export function PresupuestoEstadoBadge({ estado, className }: PresupuestoEstadoBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium ${STYLES[estado]}${className ? ` ${className}` : ""}`}
    >
      {estado}
    </span>
  );
}
