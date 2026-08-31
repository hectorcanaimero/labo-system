import dynamic from "next/dynamic";
import type { Metadata } from "next";

import {
  getKPIs,
  getRecentActivity,
  getResultadosPorMes,
} from "@labo/db/repos/dashboard";
import { getAdminDb } from "@/lib/db-server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICards } from "./KPICards";
import { QuickLinks } from "./QuickLinks";
import { RecentActivity, type RecentActivityData } from "./RecentActivity";

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
  const [kpis, resultadosPorMes, rawActivity] = await Promise.all([
    getKPIs(db),
    getResultadosPorMes(db, 6),
    getRecentActivity(db, 5),
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
      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-xs text-muted-foreground">
          Resumen operativo del laboratorio — se actualiza cada 30 segundos.
        </p>
      </header>

      <KPICards initialKPIs={kpis} />

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
