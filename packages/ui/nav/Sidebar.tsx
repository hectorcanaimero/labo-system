"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface NavItem {
  label: string;
  href: string;
  icon?: ReactNode;
}

interface SidebarContextValue {
  open: boolean;
  collapsed: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebar(): SidebarContextValue {
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

  const toggle = useCallback(() => {
    // En desktop (md) colapsa/expande el ancho; en mobile abre/cierra el off-canvas.
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setCollapsed((v) => !v);
    } else {
      setOpen((v) => !v);
    }
  }, []);

  return (
    <SidebarContext.Provider value={{ open, collapsed, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggle, collapsed } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar menú de navegación"
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {collapsed ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      )}
    </button>
  );
}

export interface SidebarProps {
  items: NavItem[];
  activeHref?: string;
  /** Marca completa (visible cuando el sidebar está expandido). */
  brand?: ReactNode;
  /** Marca compacta, p.ej. sólo el logo (visible cuando está colapsado). */
  brandIcon?: ReactNode;
}

export function Sidebar({ items, activeHref, brand, brandIcon }: SidebarProps) {
  const { open, setOpen, collapsed } = useSidebar();
  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r bg-card text-card-foreground transition-[width,transform] duration-200 ease-out md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-16" : "md:w-64",
        )}
      >
        {collapsed && brandIcon ? (
          <div className="flex h-14 items-center justify-center border-b">{brandIcon}</div>
        ) : brand ? (
          <div className="flex h-14 items-center border-b px-4 font-semibold">{brand}</div>
        ) : null}

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = item.href === activeHref;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed ? "md:justify-center md:px-2" : "",
                )}
              >
                {item.icon ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {item.icon}
                  </span>
                ) : null}
                <span className={cn("truncate", collapsed ? "md:hidden" : "")}>
                  {item.label}
                </span>
              </a>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
