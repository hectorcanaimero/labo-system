import { redirect } from "next/navigation";

import { AuthError, getCurrentUser } from "@/lib/server/auth";

import { ResultadoForm } from "./ResultadoForm";
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

export default async function NuevoResultadoPage() {
  await requireOperadorOrRedirect();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader
        title="Nueva orden"
        description="Seleccioná un paciente, agregá líneas manualmente o desde un paquete y guardá el resultado clínico."
        back={{ href: "/resultados", label: "Órdenes" }}
      />

      <ResultadoForm mode="create" />
    </div>
  );
}
