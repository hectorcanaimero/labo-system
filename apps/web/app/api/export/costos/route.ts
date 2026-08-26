import { NextResponse } from "next/server";
import { getSql } from "@labo/db/client";
import { AuthError, getCurrentUser, AUTH_COOKIE_NAMES } from "@/lib/server/auth";
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

export async function POST(): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const sql = getSql();

    // Query both results and budgets snapshots and union them, ordered by examen_id and date.
    const rows = await sql<Record<string, unknown>[]>`
      SELECT
        r.created_at AS fecha,
        re.nombre_snap AS examen,
        re.precio_snap AS precio,
        'resultado' AS contexto,
        re.examen_id
      FROM resultados_examenes re
      JOIN resultados r ON r.id = re.resultado_id

      UNION ALL

      SELECT
        p.created_at AS fecha,
        pe.nombre_snap AS examen,
        pe.precio_snap AS precio,
        'presupuesto' AS contexto,
        pe.examen_id
      FROM presupuestos_examenes pe
      JOIN presupuestos p ON p.id = pe.presupuesto_id

      ORDER BY examen_id ASC, fecha ASC
    `;

    const columns = [
      { key: "fecha", header: "fecha", format: formatDate },
      { key: "examen", header: "examen" },
      { key: "precio", header: "precio USD snap" },
      { key: "contexto", header: "contexto" },
    ];

    const csvString = writeCsv(rows, columns);

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const filename = `exports/${yearMonth}/costos-${Date.now()}.csv`;

    const jar = cookies();
    const accessToken = jar.get(AUTH_COOKIE_NAMES.access)?.value;

    const key = await uploadCsv(csvString, filename, accessToken);
    const signedUrl = await getSignedDownloadUrl(key, accessToken);

    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error("Export costos error:", error);
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
