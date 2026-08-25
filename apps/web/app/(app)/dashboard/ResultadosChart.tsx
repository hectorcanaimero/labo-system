"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ResultadosPorMes {
  mes: string;
  count: number;
}

interface ResultadosChartProps {
  initialData: ResultadosPorMes[];
}

const POLL_INTERVAL_MS = 30_000;

const MONTH_NAMES: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function formatMes(mes: string): string {
  const [year, month] = mes.split("-");
  return `${MONTH_NAMES[month ?? ""] ?? month} '${(year ?? "").slice(2)}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">
        {payload[0]?.value ?? 0} resultado{(payload[0]?.value ?? 0) !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

export default function ResultadosChart({ initialData }: ResultadosChartProps) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch("/api/dashboard?months=6", {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json.resultadosPorMes as ResultadosPorMes[]);
      } catch {
        // silently fail — stale chart data is acceptable
      }
    }

    const timer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const chartData = data.map((item) => ({
    mes: formatMes(item.mes),
    resultados: item.count,
  }));

  const isEmpty = chartData.every((d) => d.resultados === 0);

  if (isEmpty) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin resultados registrados en los últimos 6 meses.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
        <Bar
          dataKey="resultados"
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
          maxBarSize={56}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
