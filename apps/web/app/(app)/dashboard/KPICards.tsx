"use client";

import { useEffect, useState } from "react";
import { Banknote, DollarSign, FileText, FlaskConical, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toHumanError } from "@labo/lib/error-messages";

import { apiFetch } from "@/lib/api-client";
export interface DashboardKPIs {
  pacientesMes: number;
  resultadosMes: number;
  presupuestosMes: number;
  ingresosEstimadosUsd: number;
}

export interface DashboardTasa {
  tasa: number;
  fuente: string;
  scraped_at: string;
  stale: boolean;
}

interface KPICardsProps {
  initialKPIs: DashboardKPIs;
  tasa?: DashboardTasa | null;
}

function formatTasaFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const POLL_INTERVAL_MS = 30_000;

function formatCurrency(value: number): string {
  return `$${value.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function KPICards({ initialKPIs, tasa }: KPICardsProps) {
  const [kpis, setKPIs] = useState(initialKPIs);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await apiFetch("/api/dashboard", {
          headers: { accept: "application/json" },
        });
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

    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
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
    },
    {
      label: "Órdenes entregadas",
      value: kpis.resultadosMes.toString(),
      suffix: "este mes",
      icon: FlaskConical,
    },
    {
      label: "Presupuestos cerrados",
      value: kpis.presupuestosMes.toString(),
      suffix: "este mes",
      icon: FileText,
    },
    {
      label: "Ingresos estimados",
      value: formatCurrency(kpis.ingresosEstimadosUsd),
      suffix: "USD este mes",
      icon: DollarSign,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <Icon
                  className="h-4 w-4 text-muted-foreground/60"
                  aria-hidden
                />
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {card.value}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {card.suffix}
                </p>
              </CardContent>
            </Card>
          );
        })}

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Tasa BCV
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground/60" aria-hidden />
          </CardHeader>
          <CardContent>
            {tasa ? (
              <>
                <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  Bs. {tasa.tasa.toFixed(2)}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${tasa.stale ? "bg-amber-500" : "bg-emerald-500"}`}
                    aria-hidden
                  />
                  <span className="font-mono normal-case">{formatTasaFecha(tasa.scraped_at)}</span>
                  · {tasa.fuente === "manual" ? "manual" : "BCV"}
                  {tasa.stale ? " · desactualizada" : ""}
                </p>
              </>
            ) : (
              <>
                <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-muted-foreground">
                  —
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Sin tasa cargada
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function KPICardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="shadow-none">
          <CardHeader className="pb-2">
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
