import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/presupuestos";
import { AuthError, getCurrentUser } from "@/lib/server/auth";

import { PresupuestosList, type PaginatedPresupuestosResponse } from "./PresupuestosList";

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

export default async function PresupuestosPage() {
  await requireOperadorOrRedirect();

  const result = await list({ page: 1, limit: PAGE_LIMIT });

  const initialData: PaginatedPresupuestosResponse = {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      created_at: item.created_at.toISOString(),
      lineas: item.lineas.map((linea) => ({ ...linea })),
    })),
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Operación clínica
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Presupuestos</h1>
        <p className="text-sm text-muted-foreground">
          Cotizá estudios en USD y Bs con tasa BCV, aprobá presupuestos y convertilos en resultados clínicos.
        </p>
      </div>

      <PresupuestosList initialData={initialData} pageSize={PAGE_LIMIT} />
    </div>
  );
}
