import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@labo/db/client";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { writeCsv, uploadCsv, getSignedDownloadUrl } from "@labo/lib/csv-export";

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
    const pacienteId = typeof filters.pacienteId === "string" ? filters.pacienteId.trim() : "";

    const sql = getSql();
    const limit = 1000;
    let offset = 0;
    let hasMore = true;
    const allResultados: Record<string, unknown>[] = [];

    const conditions = [sql`TRUE`];
    if (desde) conditions.push(sql`r.fecha_muestra >= ${desde}::timestamptz`);
    if (hasta) {
      conditions.push(sql`r.fecha_muestra < (${hasta}::date + INTERVAL '1 day')`);
    }
    if (estado) conditions.push(sql`r.estado = ${estado}`);
    if (pacienteId) conditions.push(sql`r.paciente_id = ${pacienteId}`);
    const where = conditions.reduce((result, condition) => sql`${result} AND ${condition}`);

    while (hasMore) {
      const batch = await sql<Record<string, unknown>[]>`
        SELECT r.id, r.paciente_id, r.fecha_muestra, r.fecha_resultado,
               r.medico_solicitante, r.estado, r.observaciones,
               p.nombre AS paciente_nombre, p.apellido AS paciente_apellido,
               p.cedula AS paciente_cedula
        FROM resultados r
        INNER JOIN pacientes p ON p.id = r.paciente_id
        WHERE ${where}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      const resultIds = batch.map((r) => String(r.id));
      const lineas = await sql<Record<string, unknown>[]>`
        SELECT id, resultado_id, examen_id, nombre_snap, precio_snap, unidad_snap, valor, orden
        FROM resultados_examenes
        WHERE resultado_id IN ${sql(resultIds)}
        ORDER BY orden ASC, id ASC
      `;

      const lineasByResultId = new Map<string, Record<string, unknown>[]>();
      for (const linea of lineas) {
        const rId = String(linea.resultado_id);
        const list = lineasByResultId.get(rId) || [];
        list.push(linea);
        lineasByResultId.set(rId, list);
      }

      for (const row of batch) {
        const rId = String(row.id);
        const rLineas = lineasByResultId.get(rId) || [];

        const countExamenes = rLineas.length;

        const examenesStr = rLineas
          .map((line) => {
            const val = String(line.valor || "").trim();
            const unit = String(line.unidad_snap || "").trim();
            const displayVal = unit ? `${val} ${unit}` : val;
            return `${line.nombre_snap}: ${displayVal}`;
          })
          .join("; ");

        const name = String(row.paciente_nombre || "").trim();
        const surname = String(row.paciente_apellido || "").trim();
        const paciente = `${name} ${surname}`.trim();

        allResultados.push({
          fecha_muestra: row.fecha_muestra,
          fecha_resultado: row.fecha_resultado,
          paciente,
          cedula: String(row.paciente_cedula || "").trim(),
          medico_solicitante: row.medico_solicitante,
          estado: row.estado,
          count_examenes: countExamenes,
          examenes: examenesStr,
          observaciones: row.observaciones,
        });
      }

      if (batch.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    const columns = [
      { key: "fecha_muestra", header: "fecha muestra", format: formatDate },
      { key: "fecha_resultado", header: "fecha resultado", format: formatDate },
      { key: "paciente", header: "paciente" },
      { key: "cedula", header: "cédula" },
      { key: "medico_solicitante", header: "médico solicitante" },
      { key: "estado", header: "estado" },
      { key: "count_examenes", header: "count exámenes" },
      { key: "examenes", header: "exámenes" },
      { key: "observaciones", header: "observaciones" },
    ];

    const csvString = writeCsv(allResultados, columns);

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const filename = `exports/${yearMonth}/resultados-${Date.now()}.csv`;

    const key = await uploadCsv(csvString, filename);
    const signedUrl = getSignedDownloadUrl(key);

    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error("Export resultados error:", error);
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
