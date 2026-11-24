import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/resultados";
import { PageHeader } from "@/components/layout/PageHeader";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { ResultadosList } from "../ResultadosList";

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

/** Menú "Resultados": la tabla de órdenes fija en las entregadas. */
export default async function ResultadosEntregadosPage() {
  await requireOperadorOrRedirect();

  const data = await list(getAdminDb(), {
    page: 1,
    limit: PAGE_LIMIT,
    filters: { estado: "Entregada" },
  });

  return (
    <div className="mx-auto flex max-w-[100rem] flex-col gap-4">
      <PageHeader
        title="Resultados"
        count={data.total}
        description="Órdenes entregadas al paciente."
      />
      <ResultadosList
        initialData={{
          ...data,
          items: data.items.map((item) => ({ ...item, fecha_resultado: item.fecha_resultado ?? null })),
        }}
        pageSize={PAGE_LIMIT}
        estadoFijo="Entregada"
      />
    </div>
  );
}
