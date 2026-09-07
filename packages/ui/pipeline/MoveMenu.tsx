"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

export interface MoveMenuProps<E extends string> {
  /** Para el nombre accesible: "Mover a… — Juan Pérez". */
  cardLabel: string;
  targets: readonly E[];
  onMove: (destino: E) => void;
  /** Acciones propias del dominio (convertir en orden, ver detalle…). */
  extraItems?: readonly { label: string; onSelect: () => void }[];
  disabled?: boolean;
}

/**
 * Alternativa al arrastre, operable con teclado (WCAG 2.2 — todo movimiento
 * que se hace arrastrando necesita otra vía).
 *
 * Está escrito a mano y no con Radix porque `@labo/ui` no depende de
 * `@radix-ui/react-dropdown-menu` —sólo lo tiene la app— y sumar la
 * dependencia al paquete compartido por un menú de tres opciones era más caro
 * que estas líneas.
 */
export function MoveMenu<E extends string>({
  cardLabel,
  targets,
  onMove,
  extraItems = [],
  disabled = false,
}: MoveMenuProps<E>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const items = [
    ...targets.map((destino) => ({
      key: `mover:${destino}`,
      label: destino,
      onSelect: () => onMove(destino),
    })),
    ...extraItems.map((item, i) => ({
      key: `extra:${i}`,
      label: item.label,
      onSelect: item.onSelect,
    })),
  ];

  useEffect(() => {
    if (!open) return;
    itemsRef.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function abrir(index: number): void {
    if (items.length === 0) return;
    setActiveIndex(index);
    setOpen(true);
  }

  function cerrar({ devolverFoco = true }: { devolverFoco?: boolean } = {}): void {
    setOpen(false);
    if (devolverFoco) triggerRef.current?.focus();
  }

  const sinDestinos = items.length === 0;

  return (
    <div
      ref={containerRef}
      className="relative"
      // El menú vive dentro de una tarjeta arrastrable: sin esto, apretar el
      // botón empieza un arrastre en cuanto el dedo se mueve 6 px.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || sinDestinos}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={
          sinDestinos
            ? `${cardLabel}: sin movimientos disponibles`
            : `Mover a… ${cardLabel}`
        }
        onClick={() => (open ? cerrar() : abrir(0))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            abrir(0);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            abrir(items.length - 1);
          }
        }}
        className="rounded p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
      >
        <MoreVertical className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={`Mover ${cardLabel} a`}
          className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cerrar();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((i) => (i + 1) % items.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((i) => (i - 1 + items.length) % items.length);
            } else if (event.key === "Tab") {
              // Tab sale del menú: cerrarlo sin robarle el foco al siguiente.
              cerrar({ devolverFoco: false });
            }
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(node) => {
                itemsRef.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => {
                cerrar();
                item.onSelect();
              }}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent focus:bg-accent focus:outline-none"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
