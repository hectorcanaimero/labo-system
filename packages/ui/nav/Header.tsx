"use client";

import type { ReactNode } from "react";

export interface HeaderUser {
  name: string;
  email?: string;
}

export interface HeaderProps {
  user: HeaderUser;
  leading?: ReactNode;
  onLogout?: () => void;
}

export function Header({ user, leading, onLogout }: HeaderProps) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      {leading}
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {initial}
        </div>
        <div className="hidden flex-col leading-tight sm:flex">
          <span className="text-sm font-medium text-foreground">
            {user.name}
          </span>
          {user.email ? (
            <span className="text-xs text-muted-foreground">{user.email}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
