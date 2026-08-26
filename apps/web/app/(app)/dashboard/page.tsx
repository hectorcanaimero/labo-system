import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { getKPIs, getResultadosPorMes, getRecentActivity } from "@labo/db/repos/dashboard";
import { KPICards } from "./KPICards";
import { RecentActivity } from "./RecentActivity";
import { QuickLinks } from "./QuickLinks";
import type { RecentActivityData } from "./RecentActivity";

export const metadata: Metadata = {
  title: "Dashboard — RV Laboratorio",
};

const ResultadosChart = dynamic(() => import("./ResultadosChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
      Cargando gráfico…
    </div>
  ),
});

function toIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

export default async function DashboardPage() {
  const [kpis, resultadosPorMes, rawActivity] = await Promise.all([
    getKPIs(),
    getResultadosPorMes(6),
    getRecentActivity(5),
  ]);

  // Serialize Date objects to ISO strings for Client Components
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
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <div>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Panel
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen de actividad del laboratorio
        </p>
      </div>

      <KPICards initialKPIs={kpis} />

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Resultados — últimos 6 meses
        </h2>
        <ResultadosChart initialData={resultadosPorMes} />
      </div>

      <RecentActivity initialActivity={activity} />

      <QuickLinks />
    </main>
  );
}
