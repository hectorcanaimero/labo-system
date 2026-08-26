import { NextResponse, type NextRequest } from "next/server";
import { parseExamenesXlsx } from "@labo/lib/xlsx-import";
import { examenesImportBatch } from "@labo/db/repos/examenes";
import { AuthError, requireRole } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toStatus(error: unknown): { status: number; error: string } {
  if (error instanceof AuthError) {
    return {
      status: error.code === "UNAUTHENTICATED" ? 401 : 403,
      error: error.code,
    };
  }
  const code = error instanceof Error ? error.message : "ERROR_GENERICO";
  return { status: 500, error: code };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireRole("admin");

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "VALIDACION_FALLIDA" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se proporcionó un archivo" }, { status: 400 });
    }

    // Reject > 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Archivo excede los 10 MB" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Server-side parsing
    const { valid, errors } = parseExamenesXlsx(buffer);

    let result = {
      titulos_creados: 0,
      examenes_creados: 0,
      examenes_actualizados: 0,
      duplicados_ignorados: 0,
    };

    if (valid.length > 0) {
      result = await examenesImportBatch(valid, user.userId);
    }

    return NextResponse.json({
      titulos_creados: result.titulos_creados,
      examenes_creados: result.examenes_creados,
      examenes_actualizados: result.examenes_actualizados,
      duplicados_ignorados: result.duplicados_ignorados,
      errores: errors,
    }, { status: 200 });

  } catch (error) {
    const { status, error: code } = toStatus(error);
    return NextResponse.json({ error: code }, { status });
  }
}
