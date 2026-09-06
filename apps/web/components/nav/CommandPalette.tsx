"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { CornerDownLeft, Loader2, Search, UserRound } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export interface CommandPage {
  label: string;
  href: string;
  icon?: ReactNode;
  keywords?: string[];
}

export interface CommandAction {
  label: string;
  href: string;
  icon?: ReactNode;
  /** Tecla que dispara la acción fuera de inputs (p.ej. "c"). */
  hotkey?: string;
}

interface PacienteHit {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: CommandPage[];
  actions: CommandAction[];
}

const SEARCH_DEBOUNCE_MS = 200;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Registra los atajos globales: ⌘K abre la paleta, `/` también, y cada
 * acción con `hotkey` navega directo (sólo si no hay un input enfocado).
 */
export function useGlobalShortcuts(
  actions: CommandAction[],
  setOpen: (open: boolean) => void,
) {
  const router = useRouter();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      const hit = actions.find((a) => a.hotkey && a.hotkey === event.key.toLowerCase());
      if (hit) {
        event.preventDefault();
        router.push(hit.href);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, router, setOpen]);
}

export function CommandPalette({ open, onOpenChange, pages, actions }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PacienteHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
    }
  }, [open]);

  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSearching(true);
        const res = await fetch(`/api/pacientes/search?term=${encodeURIComponent(term)}`, {
          headers: { accept: "application/json" },
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const payload = (await res.json()) as PacienteHit[];
        setHits(payload.slice(0, 8));
      } catch {
        // abort o red: silencioso, la paleta sigue usable
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term]);

  const go = useMemo(
    () => (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-lg [&>button]:hidden">
        <DialogTitle className="sr-only">Buscar y ejecutar comandos</DialogTitle>
        <Command
          shouldFilter={true}
          label="Paleta de comandos"
          className="flex flex-col"
        >
          <div className="flex h-11 items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar paciente por nombre o cédula, o ir a…"
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <kbd>esc</kbd>
            )}
          </div>
          <Command.List className="max-h-[360px] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
              {term.length < 2 ? "Escribí para buscar." : "Sin resultados."}
            </Command.Empty>

            {hits.length > 0 ? (
              <Command.Group heading="Pacientes">
                {hits.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`paciente ${p.nombre} ${p.apellido} ${p.cedula} ${p.id}`}
                    onSelect={() => go(`/pacientes/${p.id}`)}
                    className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-foreground aria-selected:bg-accent"
                  >
                    <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1 truncate">
                      {p.nombre} {p.apellido}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {p.cedula}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            <Command.Group heading="Acciones">
              {actions.map((a) => (
                <Command.Item
                  key={a.href}
                  value={`accion ${a.label}`}
                  onSelect={() => go(a.href)}
                  className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-foreground aria-selected:bg-accent"
                >
                  <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                    {a.icon}
                  </span>
                  <span className="flex-1 truncate">{a.label}</span>
                  {a.hotkey ? <kbd>{a.hotkey.toUpperCase()}</kbd> : null}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Ir a">
              {pages.map((p) => (
                <Command.Item
                  key={p.href}
                  value={`ir ${p.label} ${(p.keywords ?? []).join(" ")}`}
                  onSelect={() => go(p.href)}
                  className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-foreground aria-selected:bg-accent"
                >
                  <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                    {p.icon}
                  </span>
                  <span className="flex-1 truncate">{p.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
          <div className="flex h-8 items-center gap-3 border-t border-border px-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd>↑</kbd>
              <kbd>↓</kbd> navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd>
                <CornerDownLeft className="h-2.5 w-2.5" aria-hidden="true" />
              </kbd>
              abrir
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
