"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ReactNode } from "react";

export interface SortableListProps {
  items: readonly string[];
  children: ReactNode;
  className?: string;
}

/**
 * Contexto de ordenamiento vertical para una colección. El `DndContext` (y sus
 * sensores) siguen siendo de la app; acá va el `SortableContext` que los
 * `useSortable` de las filas necesitan para recalcular el orden. Sin él, las
 * filas se registran pero el arrastre no reordena nada.
 */
export function SortableList({ items, children, className }: SortableListProps) {
  return (
    <SortableContext items={[...items]} strategy={verticalListSortingStrategy}>
      <div className={className} data-sortable-count={items.length}>
        {children}
      </div>
    </SortableContext>
  );
}
