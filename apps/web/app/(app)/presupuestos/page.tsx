import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/presupuestos";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { PresupuestosList, type PaginatedPresupuestosResponse } from "./PresupuestosList";
import { PageHeader } from "@/components/layout/PageHeader";

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
      <PageHeader
        title="Presupuestos"
        count={result.total}
        description="Pipeline comercial — cotizá, enviá al cliente, aprobá y generá órdenes."
      />

      <PresupuestosList initialData={initialData} pageSize={PAGE_LIMIT} />
    </div>
  );
}
