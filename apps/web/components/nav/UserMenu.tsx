"use client";

import { useEffect, useState } from "react";
import { ChevronsUpDown, LogOut, Moon, Sun } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const THEME_STORAGE_KEY = "labo.theme";

export interface UserMenuUser {
  name: string;
  email?: string;
  role?: "admin" | "operador";
}

interface UserMenuProps {
  user: UserMenuUser | null;
  loading?: boolean;
  loggingOut?: boolean;
  /** Muestra sólo el avatar (sidebar colapsado). */
  compact?: boolean;
  onLogout?: () => void;
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // Sin persistencia: no bloqueamos la UI.
  }
}

/** Restaura el tema guardado. Se llama una vez desde el layout. */
export function useRestoreTheme() {
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark") document.documentElement.classList.add("dark");
    } catch {
      // ignorar
    }
  }, []);
}

export function UserMenu({ user, loading, loggingOut, compact, onLogout }: UserMenuProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const name = user?.name?.trim() ?? "";
  const initial = name.charAt(0).toUpperCase() || "?";

  if (loading) {
    return (
      <div className="flex h-9 items-center gap-2 px-1" aria-hidden="true">
        <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
        {!compact ? <div className="h-3 w-24 animate-pulse rounded bg-muted" /> : null}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menú de usuario"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "md:justify-center md:px-0" : "",
          )}
        >
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            {initial}
          </span>
          <span className={cn("flex min-w-0 flex-1 flex-col leading-tight", compact ? "md:hidden" : "")}>
            <span className="truncate text-xs font-medium text-foreground">{name}</span>
            {user?.role ? (
              <span className="truncate text-[11px] capitalize text-muted-foreground">{user.role}</span>
            ) : null}
          </span>
          <ChevronsUpDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", compact ? "md:hidden" : "")}
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="text-sm font-medium text-foreground">{name}</span>
          {user?.email ? (
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            const next = !dark;
            setDark(next);
            applyTheme(next);
          }}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {dark ? "Tema claro" : "Tema oscuro"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={loggingOut} onSelect={() => onLogout?.()}>
          <LogOut className="h-4 w-4" />
          {loggingOut ? "Cerrando…" : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
