"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon?: ReactNode;
  /** Atajo de teclado mostrado a la derecha (p.ej. "G D"). Solo informativo. */
  shortcut?: string;
}

export interface NavGroup {
  /** Etiqueta del grupo. Si se omite, los ítems van sin encabezado. */
  label?: string;
  items: NavItem[];
}

interface SidebarContextValue {
  open: boolean;
  collapsed: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar debe usarse dentro de <SidebarProvider>");
  }
  return ctx;
}

type ClassValue = string | false | null | undefined;
function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

const COLLAPSE_STORAGE_KEY = "labo.sidebar.collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hidratamos la preferencia después del mount para evitar mismatch con SSR.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // localStorage no disponible (p.ej. modo incógnito estricto): se ignora.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // No bloqueamos la UI si no se puede persistir.
    }
  }, [collapsed, hydrated]);

  // Sincronizar clase CSS en el body para ajustar el layout
  useEffect(() => {
    if (collapsed) {
      document.body.classList.add("sidebar-collapsed");
    } else {
      document.body.classList.remove("sidebar-collapsed");
    }
  }, [collapsed]);

  const toggle = useCallback(() => {
    // En desktop (md) colapsa/expande el ancho; en mobile abre/cierra el off-canvas.
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setCollapsed((v) => !v);
    } else {
      setOpen((v) => !v);
    }
  }, []);

  // Cmd/Ctrl + \ colapsa el sidebar (mismo atajo que Linear).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <SidebarContext.Provider value={{ open, collapsed, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggle } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar menú de navegación"
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export interface LinkLikeProps {
  href: string;
  className?: string;
  title?: string;
  "aria-current"?: "page" | undefined;
  onClick?: () => void;
  children?: ReactNode;
}

/** Cualquier componente compatible con `next/link` o un `<a>`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LinkLike = ComponentType<any>;

const DefaultLink = ({ href, children, ...rest }: LinkLikeProps) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

export interface SidebarProps {
  groups: NavGroup[];
  activeHref?: string;
  /** Marca completa (visible cuando el sidebar está expandido). */
  brand?: ReactNode;
  /** Marca compacta, p.ej. sólo el logo (visible cuando está colapsado). */
  brandIcon?: ReactNode;
  /** Slot al pie (usuario, tasa, etc.). */
  footer?: ReactNode;
  /** Abre la paleta de comandos. Si se define, se muestra el botón "Buscar". */
  onSearch?: () => void;
  /** Componente de link (p.ej. `next/link`) para navegación sin recarga. */
  linkComponent?: LinkLike;
}

export function Sidebar({
  groups,
  activeHref,
  brand,
  brandIcon,
  footer,
  onSearch,
  linkComponent,
}: SidebarProps) {
  const { open, setOpen, collapsed, toggle } = useSidebar();
  const Link = linkComponent ?? DefaultLink;
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-foreground transition-[width,transform] duration-200 ease-out md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-14" : "md:w-56",
        )}
      >
        {/* Marca + colapsar */}
        <div
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 px-3",
            collapsed ? "md:flex-col md:justify-center md:gap-1 md:px-0 md:py-1" : "",
          )}
        >
          <div className={cn("min-w-0 flex-1 text-sm font-semibold", collapsed ? "md:hidden" : "")}>
            {brand}
          </div>
          {collapsed && brandIcon ? (
            <div className="hidden md:flex">{brandIcon}</div>
          ) : null}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
            title={collapsed ? "Expandir (⌘\\)" : "Colapsar (⌘\\)"}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
          >
            <CollapseIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Buscar / paleta de comandos */}
        {onSearch ? (
          <div className={cn("px-2 pb-2", collapsed ? "md:px-1.5" : "")}>
            <button
              type="button"
              onClick={onSearch}
              aria-label="Buscar (⌘K)"
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                collapsed ? "md:justify-center md:px-0" : "",
              )}
            >
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className={cn("flex-1 truncate text-left", collapsed ? "md:hidden" : "")}>
                Buscar…
              </span>
              <kbd className={cn(collapsed ? "md:hidden" : "")}>⌘K</kbd>
            </button>
          </div>
        ) : null}

        <nav className={cn("flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-1", collapsed ? "md:px-1.5" : "")}>
          {groups.map((group, gi) => (
            <div key={group.label ?? gi} className="flex flex-col gap-0.5">
              {group.label ? (
                <p
                  className={cn(
                    "px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80",
                    collapsed ? "md:hidden" : "",
                  )}
                >
                  {group.label}
                </p>
              ) : null}
              {group.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                    className={cn(
                      "group flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      collapsed ? "md:justify-center md:px-0" : "",
                    )}
                  >
                    {item.icon ? (
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center",
                          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    <span className={cn("flex-1 truncate", collapsed ? "md:hidden" : "")}>
                      {item.label}
                    </span>
                    {item.shortcut ? (
                      <kbd
                        className={cn(
                          "opacity-0 transition-opacity group-hover:opacity-100",
                          collapsed ? "md:hidden" : "",
                        )}
                      >
                        {item.shortcut}
                      </kbd>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {footer ? (
          <div className={cn("shrink-0 border-t border-border p-2", collapsed ? "md:p-1.5" : "")}>
            {footer}
          </div>
        ) : null}
      </aside>
    </>
  );
}
