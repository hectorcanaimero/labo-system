"use client";

import type { ReactNode } from "react";

export interface SortableListProps {
  items: readonly string[];
  children: ReactNode;
  className?: string;
}

/** Layout shell for a sortable collection; dnd-kit context belongs to the app. */
export function SortableList({ items, children, className }: SortableListProps) {
  return <div className={className} data-sortable-count={items.length}>{children}</div>;
}
