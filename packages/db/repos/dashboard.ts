import type { Db } from "../sdk";

export interface DashboardKPIs {
  pacientesMes: number;
  resultadosMes: number;
  presupuestosMes: number;
  ingresosEstimadosUsd: number;
}

export interface ResultadosPorMes {
  mes: string;
  count: number;
}

export interface RecentActivity {
  resultados: {
    id: string;
    paciente_id: string;
    paciente_nombre: string;
    paciente_apellido: string;
    fecha_muestra: string;
    estado: string;
    created_at: string;
  }[];
  presupuestos: {
    id: string;
    paciente_id: string | null;
    paciente_nombre: string | null;
    paciente_apellido: string | null;
    paciente_nombre_libre: string | null;
    estado: string;
    total_usd: number;
    created_at: string;
  }[];
}

function firstOfCurrentMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function firstOfMonthOffset(monthsBack: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 1));
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getKPIs(db: Db): Promise<DashboardKPIs> {
  const monthStart = firstOfCurrentMonth();

  const [pacientesRes, resultadosRes, presupuestosRes] = await Promise.all([
    db
      .from("pacientes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
    db
      .from("ordenes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart)
      .eq("estado", "Entregada"),
    db
      .from("presupuestos")
      .select("total_usd")
      .gte("created_at", monthStart)
      .in("estado", ["Aprobado", "Convertido"]),
  ]);

  if (pacientesRes.error) throw new Error(`dashboard.pacientes: ${pacientesRes.error.message}`);
  if (resultadosRes.error) throw new Error(`dashboard.resultados: ${resultadosRes.error.message}`);
  if (presupuestosRes.error) throw new Error(`dashboard.presupuestos: ${presupuestosRes.error.message}`);

  const presRows = (presupuestosRes.data ?? []) as Array<{ total_usd: number | string }>;
  const ingresos = presRows.reduce((acc, r) => acc + Number(r.total_usd ?? 0), 0);

  return {
    pacientesMes: pacientesRes.count ?? 0,
    resultadosMes: resultadosRes.count ?? 0,
    presupuestosMes: presRows.length,
    ingresosEstimadosUsd: ingresos,
  };
}

export async function getResultadosPorMes(
  db: Db,
  months: number,
): Promise<ResultadosPorMes[]> {
  // Baseline vacío para todos los meses del rango (evita huecos como hacía
  // el `generate_series` de SQL).
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    buckets.set(monthKey(firstOfMonthOffset(i)), 0);
  }

  const from = firstOfMonthOffset(months - 1).toISOString();
  const { data, error } = await db
    .from("ordenes")
    .select("created_at")
    .gte("created_at", from);
  if (error) throw new Error(`dashboard.resultadosPorMes: ${error.message}`);

  for (const row of (data ?? []) as Array<{ created_at: string }>) {
    const key = monthKey(new Date(row.created_at));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries()).map(([mes, count]) => ({ mes, count }));
}

export async function getRecentActivity(
  db: Db,
  limit: number,
): Promise<RecentActivity> {
  const [resRes, presRes] = await Promise.all([
    db
      .from("ordenes")
      .select(
        "id, paciente_id, fecha_muestra, estado, created_at, pacientes ( nombre, apellido )",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("presupuestos")
      .select(
        "id, paciente_id, paciente_nombre_libre, estado, total_usd, created_at, pacientes ( nombre, apellido )",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (resRes.error) throw new Error(`dashboard.recent.resultados: ${resRes.error.message}`);
  if (presRes.error) throw new Error(`dashboard.recent.presupuestos: ${presRes.error.message}`);

  type ResRow = {
    id: string;
    paciente_id: string;
    fecha_muestra: string;
    estado: string;
    created_at: string;
    pacientes?: { nombre?: string; apellido?: string } | null;
  };
  type PresRow = {
    id: string;
    paciente_id: string | null;
    paciente_nombre_libre: string | null;
    estado: string;
    total_usd: number | string;
    created_at: string;
    pacientes?: { nombre?: string; apellido?: string } | null;
  };

  const resultados = ((resRes.data ?? []) as ResRow[]).map((r) => ({
    id: r.id,
    paciente_id: r.paciente_id,
    paciente_nombre: r.pacientes?.nombre ?? "",
    paciente_apellido: r.pacientes?.apellido ?? "",
    fecha_muestra: r.fecha_muestra,
    estado: r.estado,
    created_at: r.created_at,
  }));

  const presupuestos = ((presRes.data ?? []) as PresRow[]).map((p) => ({
    id: p.id,
    paciente_id: p.paciente_id,
    paciente_nombre: p.pacientes?.nombre ?? null,
    paciente_apellido: p.pacientes?.apellido ?? null,
    paciente_nombre_libre: p.paciente_nombre_libre,
    estado: p.estado,
    total_usd: Number(p.total_usd ?? 0),
    created_at: p.created_at,
  }));

  return { resultados, presupuestos };
}
