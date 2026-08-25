import { getSql } from "../client";

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
    fecha_muestra: Date;
    estado: string;
    created_at: Date;
  }[];
  presupuestos: {
    id: string;
    paciente_id: string | null;
    paciente_nombre: string | null;
    paciente_apellido: string | null;
    paciente_nombre_libre: string | null;
    estado: string;
    total_usd: number;
    created_at: Date;
  }[];
}

export async function getKPIs(): Promise<DashboardKPIs> {
  const sql = getSql();

  const [
    pacientesCount,
    resultadosCount,
    presupuestosData,
  ] = await Promise.all([
    sql`
      SELECT count(*)::int as count 
      FROM pacientes 
      WHERE created_at >= date_trunc('month', now())
    `,
    sql`
      SELECT count(*)::int as count 
      FROM resultados 
      WHERE created_at >= date_trunc('month', now())
        AND estado = 'Completado'
    `,
    sql`
      SELECT 
        count(*)::int as count,
        COALESCE(sum(total_usd), 0)::numeric as total_usd
      FROM presupuestos 
      WHERE created_at >= date_trunc('month', now())
        AND estado IN ('Aprobado', 'Convertido')
    `
  ]);

  return {
    pacientesMes: pacientesCount[0].count,
    resultadosMes: resultadosCount[0].count,
    presupuestosMes: presupuestosData[0].count,
    ingresosEstimadosUsd: Number(presupuestosData[0].total_usd),
  };
}

export async function getResultadosPorMes(months: number): Promise<ResultadosPorMes[]> {
  const sql = getSql();
  
  const rows = await sql`
    SELECT 
      to_char(g.m, 'YYYY-MM') as mes,
      count(r.id)::int as count
    FROM generate_series(
      date_trunc('month', now()) - (${months - 1} || ' months')::interval,
      date_trunc('month', now()),
      '1 month'::interval
    ) g(m)
    LEFT JOIN resultados r 
      ON date_trunc('month', r.created_at) = g.m
    GROUP BY g.m
    ORDER BY g.m ASC
  `;

  return rows as unknown as ResultadosPorMes[];
}

export async function getRecentActivity(limit: number): Promise<RecentActivity> {
  const sql = getSql();

  const [resultados, presupuestos] = await Promise.all([
    sql`
      SELECT 
        r.id,
        r.paciente_id,
        p.nombre as paciente_nombre,
        p.apellido as paciente_apellido,
        r.fecha_muestra,
        r.estado,
        r.created_at
      FROM resultados r
      JOIN pacientes p ON p.id = r.paciente_id
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `,
    sql`
      SELECT 
        pr.id,
        pr.paciente_id,
        p.nombre as paciente_nombre,
        p.apellido as paciente_apellido,
        pr.paciente_nombre_libre,
        pr.estado,
        pr.total_usd,
        pr.created_at
      FROM presupuestos pr
      LEFT JOIN pacientes p ON p.id = pr.paciente_id
      ORDER BY pr.created_at DESC
      LIMIT ${limit}
    `
  ]);

  return {
    resultados: resultados as unknown as RecentActivity["resultados"],
    presupuestos: presupuestos as unknown as RecentActivity["presupuestos"],
  };
}
