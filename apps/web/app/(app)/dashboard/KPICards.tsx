"use client";

import { useEffect, useState } from "react";
import { Users, FlaskConical, FileText, DollarSign } from "lucide-react";
import { SkeletonKPI } from "@labo/ui/feedback";
import { toHumanError } from "@labo/lib/error-messages";

export interface DashboardKPIs {
  pacientesMes: number;
  resultadosMes: number;
  presupuestosMes: number;
  ingresosEstimadosUsd: number;
}

interface KPICardsProps {
  initialKPIs: DashboardKPIs;
}

const POLL_INTERVAL_MS = 30_000;

function formatCurrency(value: number): string {
  return `$ ${value.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function KPICards({ initialKPIs }: KPICardsProps) {
  const [kpis, setKPIs] = useState(initialKPIs);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch("/api/dashboard", {
          headers: { accept: "application/json" },
        });
        if (res.status === 401) { window.location.href = "/login"; return; }
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error ?? `REQUEST_FAILED_${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) setKPIs(json.kpis as DashboardKPIs);
      } catch (err) {
        if (!cancelled) setError(toHumanError(err));
      }
    }

    const timer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const cards = [
    {
      label: "Pacientes nuevos",
      value: kpis.pacientesMes.toString(),
      suffix: "este mes",
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Resultados completados",
      value: kpis.resultadosMes.toString(),
      suffix: "este mes",
      icon: FlaskConical,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Presupuestos aprobados",
      value: kpis.presupuestosMes.toString(),
      suffix: "este mes",
      icon: FileText,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Ingresos estimados",
      value: formatCurrency(kpis.ingresosEstimadosUsd),
      suffix: "USD este mes",
      icon: DollarSign,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  <p className="mt-1 truncate text-2xl font-bold text-foreground">{card.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.suffix}</p>
                </div>
                <div className={`shrink-0 rounded-lg p-2 ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KPICardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <SkeletonKPI />
        </div>
      ))}
    </div>
  );
}
