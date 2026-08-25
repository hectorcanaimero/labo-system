import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@labo/db/client";
import { AuthError, getCurrentUser, AUTH_COOKIE_NAMES } from "@labo/lib/server/auth";
import { writeCsv, uploadCsv, getSignedDownloadUrl } from "@labo/lib/csv-export";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

function toStatus(error: unknown): { status: number; error: string } {
  if (error instanceof AuthError) {
    return {
      status: error.code === "UNAUTHENTICATED" ? 401 : 403,
      error: error.code,
    };
  }

  const code = error instanceof Error ? error.message : "ERROR_GENERICO";
  return { status: 500, error: code || "ERROR_GENERICO" };
}

async function requireOperadorMinimo(): Promise<void> {
  const user = await getCurrentUser();
  if (user.role !== "admin" && user.role !== "operador") {
    throw new AuthError("UNAUTHORIZED");
  }
}

function formatDate(date: unknown): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date as string | number);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const body = (await request.json().catch(() => ({}))) || {};
    const filters = body.filters || {};
    const desde = typeof filters.desde === "string" ? filters.desde.trim() : "";
    const hasta = typeof filters.hasta === "string" ? filters.hasta.trim() : "";
    const estado = typeof filters.estado === "string" ? filters.estado.trim() : "";

    const sql = getSql();
    const limit = 1000;
    let offset = 0;
    let hasMore = true;
    const allPresupuestos: Record<string, unknown>[] = [];

    const conditions = [sql`TRUE`];
    if (desde) conditions.push(sql`p.created_at >= ${desde}`);
    if (hasta) conditions.push(sql`p.created_at <= ${hasta}`);
    if (estado) conditions.push(sql`p.estado = ${estado}`);
    const where = conditions.reduce((result, condition) => sql`${result} AND ${condition}`);

    while (hasMore) {
      const batch = await sql<Record<string, unknown>[]>`
        SELECT p.id, p.paciente_id, p.paciente_nombre_libre,
               pa.nombre AS paciente_nombre, pa.apellido AS paciente_apellido, pa.cedula AS paciente_cedula,
               p.descuento_pct, p.ganancia_pct, p.tasa_bs, p.total_usd, p.total_bs,
               p.estado, p.created_at
        FROM presupuestos p
        LEFT JOIN pacientes pa ON pa.id = p.paciente_id
        WHERE ${where}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      const budgetIds = batch.map((r) => String(r.id));
      const lineas = await sql<Record<string, unknown>[]>`
        SELECT id, presupuesto_id, examen_id, nombre_snap, precio_snap, orden
        FROM presupuestos_examenes
        WHERE presupuesto_id IN ${sql(budgetIds)}
        ORDER BY orden ASC, id ASC
      `;

      const lineasByBudgetId = new Map<string, Record<string, unknown>[]>();
      for (const linea of lineas) {
        const pId = String(linea.presupuesto_id);
        const list = lineasByBudgetId.get(pId) || [];
        list.push(linea);
        lineasByBudgetId.set(pId, list);
      }

      for (const row of batch) {
        const pId = String(row.id);
        const pLineas = lineasByBudgetId.get(pId) || [];

        const subtotalUsd = pLineas.reduce((sum, line) => {
          const val = typeof line.precio_snap === "number" ? line.precio_snap : Number(line.precio_snap);
          return sum + (Number.isNaN(val) ? 0 : val);
        }, 0);

        const examenesStr = pLineas
          .map((line) => `${line.nombre_snap} x ${line.precio_snap}`)
          .join("; ");

        let paciente = "";
        if (row.paciente_id) {
          const name = String(row.paciente_nombre || "").trim();
          const surname = String(row.paciente_apellido || "").trim();
          paciente = `${name} ${surname}`.trim();
        } else {
          paciente = String(row.paciente_nombre_libre || "").trim();
        }

        allPresupuestos.push({
          fecha: row.created_at,
          paciente,
          cedula: row.paciente_id ? String(row.paciente_cedula || "") : "",
          estado: row.estado,
          subtotal_usd: subtotalUsd,
          descuento_pct: row.descuento_pct,
          ganancia_pct: row.ganancia_pct,
          total_usd: row.total_usd,
          tasa_bs: row.tasa_bs,
          total_bs: row.total_bs,
          examenes: examenesStr,
        });
      }

      if (batch.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    const columns = [
      { key: "fecha", header: "fecha", format: formatDate },
      { key: "paciente", header: "paciente" },
      { key: "cedula", header: "cédula" },
      { key: "estado", header: "estado" },
      { key: "subtotal_usd", header: "subtotal USD" },
      { key: "descuento_pct", header: "descuento %" },
      { key: "ganancia_pct", header: "ganancia %" },
      { key: "total_usd", header: "total USD" },
      { key: "tasa_bs", header: "tasa Bs" },
      { key: "total_bs", header: "total Bs" },
      { key: "examenes", header: "exámenes" },
    ];

    const csvString = writeCsv(allPresupuestos, columns);

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const filename = `exports/${yearMonth}/presupuestos-${Date.now()}.csv`;

    const jar = cookies();
    const accessToken = jar.get(AUTH_COOKIE_NAMES.access)?.value;

    const key = await uploadCsv(csvString, filename, accessToken);
    const signedUrl = await getSignedDownloadUrl(key, accessToken);

    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error("Export presupuestos error:", error);
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
