import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/pacientes";
import { getDb } from "@/lib/db-server";
import { AuthError, getCurrentUser } from "@/lib/server/auth";

import { PageHeader } from "@/components/layout/PageHeader";

import { PacientesList, type PaginatedPacientesResponse } from "./PacientesList";

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

export default async function PacientesPage() {
  await requireOperadorOrRedirect();

  const result = await list(getDb(), { page: 1, limit: PAGE_LIMIT });

  const initialData: PaginatedPacientesResponse = {
    ...result,
    items: result.items.map((paciente) => ({
      ...paciente,
      fecha_nacimiento: paciente.fecha_nacimiento.toISOString(),
      created_at: paciente.created_at.toISOString(),
      updated_at: paciente.updated_at.toISOString(),
    })),
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        title="Pacientes"
        count={initialData.total}
        description="Ficha clínica base con acceso rápido a órdenes y presupuestos."
      />

      <PacientesList initialData={initialData} pageSize={PAGE_LIMIT} />
    </div>
  );
}
