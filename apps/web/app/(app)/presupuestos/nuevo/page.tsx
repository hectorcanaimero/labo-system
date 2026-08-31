import { redirect } from "next/navigation";

import { getLatest } from "@labo/db/repos/tasa";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { PresupuestoForm } from "./PresupuestoForm";

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

export default async function NuevoPresupuestoPage() {
  await requireOperadorOrRedirect();

  const latest = await getLatest(getAdminDb());

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Nuevo presupuesto
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Crear presupuesto</h1>
        <p className="text-sm text-muted-foreground">
          Elegí un paciente registrado o usá un nombre libre, cargá exámenes y el total se calcula en vivo en USD y Bs.
        </p>
      </div>

      <PresupuestoForm
        mode="create"
        initialTasa={latest ? { tasa: latest.tasa, stale: latest.stale } : null}
      />
    </div>
  );
}
