import type { ReactNode } from "react";

type ClassValue = string | false | null | undefined;

function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

export interface SkeletonProps {
  className?: string;
}

/**
 * Bloque base de carga: barra gris animada. Sirve de ladrillo para los
 * skeletons compuestos (texto, tabla, form, card, KPI).
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
    />
  );
}

/** Skeleton genérico de texto: N líneas de ancho variable. */
export function SkeletonText({
  lines = 3,
  className,
}: SkeletonProps & { lines?: number }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Skeleton de botón, para listas/toolbars mientras carga. */
export function SkeletonButton({ className }: SkeletonProps) {
  return <Skeleton className={cn("h-10 w-28", className)} />;
}

/** Skeleton de campo de formulario (label + input). */
export function SkeletonFormField({ className }: SkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

/** Skeleton de formulario completo: N campos apilados. */
export function SkeletonForm({
  fields = 3,
  className,
}: SkeletonProps & { fields?: number }) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <SkeletonFormField key={i} />
      ))}
      <SkeletonButton className="mt-2" />
    </div>
  );
}

/** Skeleton de tabla: fila de header + N filas de cuerpo. */
export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: SkeletonProps & { rows?: number; cols?: number }) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex gap-4 border-b border-border pb-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton
            key={`h-${i}`}
            className={cn("h-4", i === cols - 1 ? "w-16" : "flex-1")}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={`r${r}-c${c}`}
              className={cn("h-8", c === cols - 1 ? "w-16" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton de card genérica (borde + título + líneas). */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-md border border-border bg-card p-4",
        className,
      )}
    >
      <Skeleton className="h-4 w-1/3" />
      <SkeletonText lines={2} />
    </div>
  );
}

/** Skeleton de card KPI (label + valor + delta). */
export function SkeletonKPI({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-md border border-border bg-card p-4",
        className,
      )}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/**
 * Contenedor de skeleton con ancho/altura controlados por el caller, para
 * reemplazar áreas (dropzones, previews, charts) mientras cargan.
 */
export function SkeletonBlock({
  className,
  children,
}: SkeletonProps & { children?: ReactNode }) {
  return (
    <div
      aria-hidden={children == null}
      className={cn("relative animate-pulse overflow-hidden rounded-md bg-muted", className)}
    >
      {children}
    </div>
  );
}
