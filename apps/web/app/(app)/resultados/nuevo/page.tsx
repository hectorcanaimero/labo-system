import { redirect } from "next/navigation";

import { AuthError, getCurrentUser } from "@/lib/server/auth";

import { ResultadoForm } from "./ResultadoForm";

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

export default async function NuevoResultadoPage() {
  await requireOperadorOrRedirect();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Nuevo resultado
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Cargar resultado</h1>
        <p className="text-sm text-muted-foreground">
          Seleccioná un paciente, agregá líneas manualmente o desde un paquete y guardá el resultado clínico.
        </p>
      </div>

      <ResultadoForm mode="create" />
    </div>
  );
}
