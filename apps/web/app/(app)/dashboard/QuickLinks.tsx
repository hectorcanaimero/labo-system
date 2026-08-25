import Link from "next/link";
import { Users, FlaskConical, FileText, ClipboardList, Package, Settings } from "lucide-react";

const LINKS = [
  {
    href: "/pacientes",
    label: "Pacientes",
    description: "Gestión de pacientes",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    href: "/resultados/nuevo",
    label: "Nuevo resultado",
    description: "Registrar resultado",
    icon: ClipboardList,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    href: "/presupuestos/nuevo",
    label: "Nuevo presupuesto",
    description: "Crear presupuesto",
    icon: FileText,
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    href: "/examenes",
    label: "Exámenes",
    description: "Catálogo de exámenes",
    icon: FlaskConical,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    href: "/paquetes",
    label: "Paquetes",
    description: "Paquetes de exámenes",
    icon: Package,
    color: "text-rose-600",
    bg: "bg-rose-50",
  },
  {
    href: "/config",
    label: "Configuración",
    description: "Ajustes del sistema",
    icon: Settings,
    color: "text-slate-600",
    bg: "bg-slate-50",
  },
] as const;

export function QuickLinks() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Acceso rápido</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center transition-colors hover:bg-muted/50"
            >
              <div className={`rounded-lg p-2 ${link.bg}`}>
                <Icon className={`h-5 w-5 ${link.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{link.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{link.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
