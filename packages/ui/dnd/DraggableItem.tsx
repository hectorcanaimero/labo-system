"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface DraggableItemProps extends HTMLAttributes<HTMLDivElement> {
  id: string;
  children: ReactNode;
}

/** Presentational shell; the owning app wires its dnd-kit sortable behavior. */
export const DraggableItem = forwardRef<HTMLDivElement, DraggableItemProps>(function DraggableItem(
  { id, children, ...props },
  ref,
) {
  return <div ref={ref} data-dnd-id={id} {...props}>{children}</div>;
});
