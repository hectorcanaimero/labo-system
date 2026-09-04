"use client";

import type { ReactNode } from "react";

export interface HeaderUser {
  name: string;
  email?: string;
}

export interface HeaderProps {
  user?: HeaderUser | null;
  leading?: ReactNode;
  loading?: boolean;
  loggingOut?: boolean;
  onLogout?: () => void;
  exchangeRate?: number | null;
}

export function Header({
  user,
  leading,
  loading = false,
  loggingOut = false,
  onLogout,
  exchangeRate,
}: HeaderProps) {
  const name = user?.name?.trim() ?? "";
  const initial = name.charAt(0).toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      {leading}
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        {exchangeRate && exchangeRate > 0 ? (
          <div className="hidden text-sm font-medium text-foreground sm:block">
            Bs. {exchangeRate.toFixed(2)} / USD
          </div>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            <div className="hidden flex-col gap-1.5 sm:flex">
              <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
              <div className="h-3 w-36 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ) : (
          <>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              aria-hidden="true"
            >
              {initial}
            </div>
            <div className="hidden flex-col leading-tight sm:flex">
              <span className="text-sm font-medium text-foreground">
                {name}
              </span>
              {user?.email ? (
                <span className="text-xs text-muted-foreground">
                  {user.email}
                </span>
              ) : null}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={onLogout}
          disabled={loading || loggingOut}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {loggingOut ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              Cerrando…
            </>
          ) : (
            "Cerrar sesión"
          )}
        </button>
      </div>
    </header>
  );
}
