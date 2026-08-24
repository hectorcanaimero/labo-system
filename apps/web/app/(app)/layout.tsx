"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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

import { Providers } from "@/components/providers";
import {
  Header,
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
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

const PLACEHOLDER_USER = {
  name: "Dr. Placeholder",
  email: "demo@labsystem.dev",
};

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

function handleLogoutStub() {
  console.info("[LabSystem] logout stub — auth real en F0.auth.T*");
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, NAV_ITEMS);

  return (
    <Providers>
      <SidebarProvider>
        <div className="flex min-h-screen bg-background">
          <Sidebar
            items={NAV_ITEMS}
            activeHref={activeHref}
            brand={<span className="text-base">LabSystem</span>}
          />
          <div className="flex min-h-screen flex-1 flex-col md:min-w-0">
            <Header
              user={PLACEHOLDER_USER}
              leading={<SidebarTrigger />}
              onLogout={handleLogoutStub}
            />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </Providers>
  );
}
