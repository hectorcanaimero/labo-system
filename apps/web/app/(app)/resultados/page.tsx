import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/resultados";
import { AuthError, getCurrentUser } from "@labo/lib/server/auth";

import { ResultadosList, type PaginatedResultadosResponse } from "./ResultadosList";

const PAGE_LIMIT = 20;

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

  const result = await list({ page: 1, limit: PAGE_LIMIT });

  const initialData: PaginatedResultadosResponse = {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      fecha_muestra: item.fecha_muestra.toISOString(),
      fecha_resultado: item.fecha_resultado?.toISOString() ?? null,
      created_at: item.created_at.toISOString(),
    })),
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Operación clínica
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Resultados</h1>
        <p className="text-sm text-muted-foreground">
          Gestioná resultados clínicos, cargá líneas desde paquetes y descargá la ficha PDF lista para entregar.
        </p>
      </div>

      <ResultadosList initialData={initialData} pageSize={PAGE_LIMIT} />
    </div>
  );
}
