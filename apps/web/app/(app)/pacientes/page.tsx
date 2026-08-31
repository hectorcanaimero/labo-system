import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/pacientes";
import { getDb } from "@/lib/db-server";
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
      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Pacientes
          </h1>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {initialData.total}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Ficha clínica base con acceso rápido a órdenes y presupuestos.
        </p>
      </header>

      <PacientesList initialData={initialData} pageSize={PAGE_LIMIT} />
    </div>
  );
}
