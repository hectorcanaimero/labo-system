import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/pacientes";
import { AuthError, getCurrentUser } from "@/lib/server/auth";

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

  const result = await list({ page: 1, limit: PAGE_LIMIT });

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
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Pacientes</h1>
        <p className="text-sm text-muted-foreground">
          Buscá, registrá y mantené la ficha clínica base con acceso rápido a
          resultados y presupuestos.
        </p>
      </div>

      <PacientesList initialData={initialData} pageSize={PAGE_LIMIT} />
    </div>
  );
}
