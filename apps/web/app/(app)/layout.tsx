"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ClipboardList,
  FileText,
  FlaskConical,
  History,
  LayoutDashboard,
  Package,
  Plus,
  Settings,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

import {
  Header,
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  type NavGroup,
  type NavItem,
} from "@labo/ui/nav";

import {
  CommandPalette,
  useGlobalShortcuts,
  type CommandAction,
} from "@/components/nav/CommandPalette";
import { UserMenu, useRestoreTheme, type UserMenuUser } from "@/components/nav/UserMenu";

interface MeUser {
  id: string;
  email: string;
  nombre: string;
  role: "admin" | "operador";
}

const OPERACION: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Pacientes", href: "/pacientes", icon: <Users className="h-4 w-4" /> },
  { label: "Órdenes", href: "/resultados", icon: <FileText className="h-4 w-4" /> },
  { label: "Presupuestos", href: "/presupuestos", icon: <ClipboardList className="h-4 w-4" /> },
];

const CATALOGO: NavItem[] = [
  { label: "Exámenes", href: "/examenes", icon: <FlaskConical className="h-4 w-4" /> },
  { label: "Paquetes", href: "/paquetes", icon: <Package className="h-4 w-4" /> },
];

const ADMIN: NavItem[] = [
  { label: "Usuarios", href: "/usuarios", icon: <UserCog className="h-4 w-4" /> },
  { label: "Auditoría", href: "/audit", icon: <History className="h-4 w-4" /> },
  { label: "Configuración", href: "/config", icon: <Settings className="h-4 w-4" /> },
];

const ACTIONS: CommandAction[] = [
  { label: "Nueva orden", href: "/resultados/nuevo", icon: <Plus className="h-4 w-4" />, hotkey: "c" },
  { label: "Nuevo presupuesto", href: "/presupuestos/nuevo", icon: <Plus className="h-4 w-4" />, hotkey: "b" },
  { label: "Nuevo paciente", href: "/pacientes?nuevo=1", icon: <UserPlus className="h-4 w-4" />, hotkey: "p" },
];

function resolveActiveHref(pathname: string, items: NavItem[]): string | undefined {
  let best: string | undefined;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.length) {
        best = item.href;
      }
    }
  }
  return best;
}

function SidebarFooter({
  user,
  loading,
  loggingOut,
  onLogout,
}: {
  user: UserMenuUser | null;
  loading: boolean;
  loggingOut: boolean;
  onLogout: () => void;
}) {
  const { collapsed } = useSidebar();
  return (
    <UserMenu
      user={user}
      loading={loading}
      loggingOut={loggingOut}
      compact={collapsed}
      onLogout={onLogout}
    />
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<UserMenuUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useRestoreTheme();
  useGlobalShortcuts(ACTIONS, setPaletteOpen);

  const groups = useMemo<NavGroup[]>(() => {
    const base: NavGroup[] = [{ items: OPERACION }, { label: "Catálogo", items: CATALOGO }];
    if (user?.role === "admin") base.push({ label: "Administración", items: ADMIN });
    return base;
  }, [user?.role]);

  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeHref = resolveActiveHref(pathname, [...OPERACION, ...CATALOGO, ...ADMIN]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const res = await fetch("/api/me", {
          credentials: "include",
          cache: "no-store",
        });

        // Sesión expirada o inválida → a `/` de inmediato.
        if (!res.ok) {
          router.replace("/");
          return;
        }

        const data = (await res.json()) as MeUser;
        if (cancelled) return;

        setUser({
          name: data.nombre?.trim() || data.email,
          email: data.email,
          role: data.role,
        });
        setLoading(false);
      } catch {
        if (!cancelled) {
          router.replace("/");
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/me", {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Best-effort: el redirect es la fuente de "no autenticado" en el cliente.
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  const brandIcon = (
    <img src="/logo.png" alt="RV Laboratorio" className="h-6 w-6 rounded object-contain" />
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar
          groups={groups}
          activeHref={activeHref}
          linkComponent={Link}
          onSearch={() => setPaletteOpen(true)}
          brand={
            <div className="flex items-center gap-2">
              {brandIcon}
              <span className="truncate text-[13px]">RV Laboratorio</span>
            </div>
          }
          brandIcon={brandIcon}
          footer={
            <SidebarFooter
              user={user}
              loading={loading}
              loggingOut={loggingOut}
              onLogout={handleLogout}
            />
          }
        />
        <div className="flex min-h-screen flex-1 flex-col transition-[margin] duration-200 ease-out md:ml-56 md:min-w-0 [.sidebar-collapsed_&]:md:ml-14">
          <Header
            className="md:hidden"
            leading={<SidebarTrigger />}
            brand={
              <div className="flex items-center gap-2">
                {brandIcon}
                <span>RV Laboratorio</span>
              </div>
            }
          />
          <main className="flex-1 px-4 py-4 md:px-6 md:py-5">{children}</main>
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        pages={allItems.map((i) => ({ label: i.label, href: i.href, icon: i.icon }))}
        actions={ACTIONS}
      />
    </SidebarProvider>
  );
}
