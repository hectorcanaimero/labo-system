import { redirect } from "next/navigation";

import { get as getConfig } from "@labo/db/repos/config";
import { getLatest } from "@labo/db/repos/tasa";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { PresupuestoForm } from "./PresupuestoForm";
import { PageHeader } from "@/components/layout/PageHeader";

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

  const db = getAdminDb();
  const [latest, config] = await Promise.all([getLatest(db), getConfig(db)]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader
        title="Nuevo presupuesto"
        description="Elegí un paciente o usá un nombre libre, cargá exámenes y el total se calcula en vivo en USD y Bs."
        back={{ href: "/presupuestos", label: "Presupuestos" }}
      />

      <PresupuestoForm
        mode="create"
        initialTasa={latest ? { tasa: latest.tasa, stale: latest.stale } : null}
        tomaMuestraDefault={config?.toma_muestra_default_usd ?? 0}
      />
    </div>
  );
}
