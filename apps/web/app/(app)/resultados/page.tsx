import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/resultados";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { OrdenesShell } from "./OrdenesShell";
import type { PaginatedResultadosResponse } from "./ResultadosList";
import type { OrdenPipelineItem } from "./OrdenesPipelineSection";

const PAGE_LIMIT = 20;
const KANBAN_LIMIT = 200;

async function requireOperadorOrRedirect(): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") {
      redirect("/dashboard?reason=sin-permisos");
    }
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.code === "UNAUTHENTICATED" ? "/login" : "/dashboard?reason=sin-permisos");
    }
    throw error;
  }
}

export default async function ResultadosPage() {
  await requireOperadorOrRedirect();

  const db = getAdminDb();
  const [pipelineResult, listResult] = await Promise.all([
    list(db, { page: 1, limit: KANBAN_LIMIT }),
    list(db, { page: 1, limit: PAGE_LIMIT }),
  ]);

  const pipelineItems: OrdenPipelineItem[] = pipelineResult.items.map((item) => ({
    id: item.id,
    estado: item.estado,
    paciente_nombre: item.paciente_nombre,
    paciente_apellido: item.paciente_apellido,
    paciente_cedula: item.paciente_cedula,
    fecha_muestra: item.fecha_muestra,
    fecha_resultado: item.fecha_resultado ?? null,
    medico_solicitante: item.medico_solicitante,
    examenes_count: item.examenes_count,
  }));

  const initialTablaData: PaginatedResultadosResponse = {
    ...listResult,
    items: listResult.items.map((item) => ({
      ...item,
      fecha_muestra: item.fecha_muestra,
      fecha_resultado: item.fecha_resultado ?? null,
      created_at: item.created_at,
    })),
  };

  return (
    <div className="mx-auto flex max-w-[100rem] flex-col">
      <OrdenesShell
        pipelineItems={pipelineItems}
        initialTablaData={initialTablaData}
        tablaPageSize={PAGE_LIMIT}
      />
    </div>
  );
}
