"use client";

import type { ReactNode } from "react";

export interface HeaderUser {
  name: string;
  email?: string;
}

export interface HeaderProps {
  /** Contenido a la izquierda (p.ej. `SidebarTrigger`). */
  leading?: ReactNode;
  /** Marca compacta para mobile. */
  brand?: ReactNode;
  /** Contenido a la derecha (chips, menú de usuario). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * Barra superior compacta (40px). En desktop el shell tipo Linear no la
 * necesita — el usuario y la tasa viven en el pie del sidebar — así que el
 * layout la renderiza sólo en mobile.
 */
export function Header({ leading, brand, trailing, className }: HeaderProps) {
  return (
    <header
      className={[
        "sticky top-0 z-20 flex h-10 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 backdrop-blur",
        className ?? "",
      ].join(" ")}
    >
      {leading}
      <div className="min-w-0 flex-1 truncate text-sm font-semibold">{brand}</div>
      <div className="flex items-center gap-2">{trailing}</div>
    </header>
  );
}
