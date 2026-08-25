"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Package,
  Settings,
  UserCog,
  Users,
} from "lucide-react";

import {
  Header,
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  type HeaderUser,
  type NavItem,
} from "@labo/ui/nav";

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Pacientes", href: "/pacientes", icon: <Users className="h-4 w-4" /> },
  { label: "Exámenes", href: "/examenes", icon: <FlaskConical className="h-4 w-4" /> },
  { label: "Paquetes", href: "/paquetes", icon: <Package className="h-4 w-4" /> },
  { label: "Resultados", href: "/resultados", icon: <FileText className="h-4 w-4" /> },
  { label: "Presupuestos", href: "/presupuestos", icon: <ClipboardList className="h-4 w-4" /> },
  { label: "Config", href: "/config", icon: <Settings className="h-4 w-4" /> },
  { label: "Usuarios", href: "/usuarios", icon: <UserCog className="h-4 w-4" /> },
];

interface MeUser {
  id: string;
  email: string;
  nombre: string;
  role: "admin" | "operador";
}

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

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = resolveActiveHref(pathname, NAV_ITEMS);

  const [user, setUser] = useState<HeaderUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const res = await fetch("/api/me", {
          credentials: "include",
          cache: "no-store",
        });

        // Sesión expirada o inválida → a `/login` de inmediato.
        if (!res.ok) {
          router.replace("/login");
          return;
        }

        const data = (await res.json()) as MeUser;
        if (cancelled) return;

        setUser({
          name: data.nombre?.trim() || data.email,
          email: data.email,
        });
        setLoading(false);
      } catch {
        if (!cancelled) {
          router.replace("/login");
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
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar
          items={NAV_ITEMS}
          activeHref={activeHref}
          brand={<span className="text-base">LabSystem</span>}
        />
        <div className="flex min-h-screen flex-1 flex-col md:min-w-0">
          <Header
            user={user}
            loading={loading}
            loggingOut={loggingOut}
            leading={<SidebarTrigger />}
            onLogout={handleLogout}
          />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
