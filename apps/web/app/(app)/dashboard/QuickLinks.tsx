import Link from "next/link";
import {
  ClipboardList,
  FileText,
  FlaskConical,
  Package,
  Settings,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LINKS = [
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/resultados/nuevo", label: "Nueva orden", icon: ClipboardList },
  { href: "/presupuestos/nuevo", label: "Nuevo presupuesto", icon: FileText },
  { href: "/examenes", label: "Exámenes", icon: FlaskConical },
  { href: "/paquetes", label: "Paquetes", icon: Package },
  { href: "/config", label: "Configuración", icon: Settings },
] as const;

export function QuickLinks() {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b border-border py-3">
        <CardTitle className="text-sm font-semibold">Acceso rápido</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
