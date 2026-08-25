import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@labo/db/client";
import { AuthError, getCurrentUser } from "@labo/lib/server/auth";
import { createClient } from "@insforge/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CsvColumn {
  key: string;
  header: string;
  format?: (value: unknown) => string;
}

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

function normalizeCedulaPrefixTerm(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[\s.]/g, "");
  const match = /^([VE])[-]?(\d{1,9})$/.exec(cleaned);
  if (!match) return null;

  const [, prefix, digits] = match;
  return `${prefix}-${digits}`;
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

function defaultValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function writeCsv(
  rows: Array<Record<string, unknown>>,
  columns: CsvColumn[]
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const raw = row[c.key];
        const value = c.format ? c.format(raw) : defaultValue(raw);
        return escapeCell(value);
      })
      .join(",")
  );

  return "\uFEFF" + [header, ...lines].join("\r\n");
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireOperadorMinimo();

    const body = (await request.json().catch(() => ({}))) || {};
    const filters = body.filters || {};
    const term = typeof filters.term === "string" ? filters.term.trim() : "";

    const sql = getSql();
    const limit = 1000;
    let offset = 0;
    let hasMore = true;
    const allPacientes: Record<string, unknown>[] = [];

    while (hasMore) {
      let batch: Record<string, unknown>[] = [];
      if (term.length > 0) {
        const cedulaPrefix = normalizeCedulaPrefixTerm(term);
        if (cedulaPrefix !== null) {
          batch = await sql`
            SELECT id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono, email,
                   direccion, activo, created_at, updated_at
            FROM pacientes
            WHERE activo = true
              AND cedula ILIKE ${`${cedulaPrefix}%`}
            ORDER BY created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
          `;
        } else {
          const normalizedTerm = term.toLowerCase();
          batch = await sql`
            SELECT id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono, email,
                   direccion, activo, created_at, updated_at
            FROM pacientes
            WHERE activo = true
              AND (
                lower(nombre) LIKE ${`${normalizedTerm}%`}
                OR lower(apellido) LIKE ${`${normalizedTerm}%`}
                OR cedula ILIKE ${`%${term}%`}
              )
            ORDER BY created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
          `;
        }
      } else {
        batch = await sql`
          SELECT id, nombre, apellido, cedula, fecha_nacimiento, sexo, telefono, email,
                 direccion, activo, created_at, updated_at
          FROM pacientes
          WHERE activo = true
          ORDER BY created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
      }

      allPacientes.push(...batch);

      if (batch.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    const columns: CsvColumn[] = [
      { key: "cedula", header: "cédula" },
      { key: "nombre", header: "nombre" },
      { key: "apellido", header: "apellido" },
      { key: "fecha_nacimiento", header: "fecha_nacimiento", format: formatDate },
      { key: "sexo", header: "sexo" },
      { key: "telefono", header: "teléfono" },
      { key: "email", header: "email" },
      { key: "direccion", header: "dirección" },
      { key: "created_at", header: "created_at", format: formatDate },
    ];

    const csvString = writeCsv(allPacientes, columns);

    const baseUrl = process.env.INSFORGE_URL || "https://insforge.rvlaboratorio.com";
    const anonKey = process.env.INSFORGE_ANON_KEY;

    if (!anonKey) {
      return bad(500, "CONFIG_STORAGE_MISSING");
    }

    const insforge = createClient({
      baseUrl,
      anonKey,
    });

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const filename = `exports/${yearMonth}/pacientes-${Date.now()}.csv`;

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });

    const { error: uploadError } = await insforge.storage
      .from("exports")
      .upload(filename, blob);

    if (uploadError) {
      console.error("Failed to upload CSV to InsForge storage:", uploadError);
      return bad(500, "UPLOAD_FAILED");
    }

    const { data: signedData, error: signedError } = await insforge.storage
      .from("exports")
      .createSignedUrl(filename, 3600);

    if (signedError || !signedData?.signedUrl) {
      console.error("Failed to generate signed URL:", signedError);
      return bad(500, "SIGNED_URL_FAILED");
    }

    return NextResponse.json({ url: signedData.signedUrl });
  } catch (error) {
    console.error("Export error:", error);
    const { status, error: code } = toStatus(error);
    return bad(status, code);
  }
}
