import dynamic from "next/dynamic";
import type { Metadata } from "next";

import {
  getKPIs,
  getRecentActivity,
  getResultadosPorMes,
} from "@labo/db/repos/dashboard";
import { getLatest } from "@labo/db/repos/tasa";
import { getAdminDb } from "@/lib/db-server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICards } from "./KPICards";
import { QuickLinks } from "./QuickLinks";
import { RecentActivity, type RecentActivityData } from "./RecentActivity";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: "Dashboard — RV Laboratorio",
};

const ResultadosChart = dynamic(() => import("./ResultadosChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-60 items-center justify-center text-xs text-muted-foreground">
      Cargando gráfico…
    </div>
  ),
});

function toIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

export default async function DashboardPage() {
  const db = getAdminDb();
  const [kpis, resultadosPorMes, rawActivity, tasa] = await Promise.all([
    getKPIs(db),
    getResultadosPorMes(db, 6),
    getRecentActivity(db, 5),
    getLatest(db).catch(() => null),
  ]);

  const activity: RecentActivityData = {
    resultados: rawActivity.resultados.map((r) => ({
      ...r,
      fecha_muestra: toIso(r.fecha_muestra as Date | string),
      created_at: toIso(r.created_at as Date | string),
    })),
    presupuestos: rawActivity.presupuestos.map((p) => ({
      ...p,
      created_at: toIso(p.created_at as Date | string),
    })),
  };

  return (
    <main className="mx-auto flex max-w-[100rem] flex-col gap-4">
      <PageHeader
        title="Dashboard"
        description="Resumen operativo del laboratorio."
        meta={
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            en vivo · 30s
          </span>
        }
      />

      <KPICards
        initialKPIs={kpis}
        tasa={
          tasa
            ? { tasa: tasa.tasa, fuente: tasa.fuente, scraped_at: tasa.scraped_at, stale: tasa.stale }
            : null
        }
      />

      <Card className="shadow-none">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm font-semibold">
            Órdenes entregadas — últimos 6 meses
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ResultadosChart initialData={resultadosPorMes} />
        </CardContent>
      </Card>

      <RecentActivity initialActivity={activity} />

      <QuickLinks />
    </main>
  );
}
