import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/presupuestos";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

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

  const result = await list(getAdminDb(), { page: 1, limit: PAGE_LIMIT });

  const initialData: PaginatedPresupuestosResponse = {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      orden_id: item.orden_id,
      created_at: item.created_at,
      lineas: item.lineas.map((linea) => ({ ...linea })),
    })),
  };

  return (
    <div className="mx-auto flex max-w-[100rem] flex-col gap-4">
      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Presupuestos
          </h1>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {result.total}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Pipeline comercial — cotizá, enviá al cliente, aprobá y generá órdenes.
        </p>
      </header>

      <PresupuestosList initialData={initialData} pageSize={PAGE_LIMIT} />
    </div>
  );
}
