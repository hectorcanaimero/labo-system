import { redirect } from "next/navigation";

import { titulosList } from "@labo/db/repos/examenes";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { TitulosNavigator } from "./TitulosNavigator";
import { PageHeader } from "@/components/layout/PageHeader";

interface TituloListItem {
  id: string;
  nombre: string;
  orden: number;
}

async function requireAdminOrRedirect(): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin") {
      redirect("/dashboard?reason=sin-permisos");
    }
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.code === "UNAUTHENTICATED" ? "/login" : "/dashboard?reason=sin-permisos");
    }
    throw error;
  }
}

export default async function ExamenesPage() {
  await requireAdminOrRedirect();

  const titulos = await titulosList(getAdminDb());
  const initialTitulos: TituloListItem[] = titulos.map((titulo) => ({
    id: titulo.id,
    nombre: titulo.nombre,
    orden: titulo.orden,
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        title="Exámenes"
        count={initialTitulos.length}
        description="Catálogo por grupos: precios, orden e importación masiva desde Excel."
      />

      <TitulosNavigator initialTitulos={initialTitulos} />
    </div>
  );
}
