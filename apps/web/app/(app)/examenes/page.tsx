import { redirect } from "next/navigation";

import { titulosList } from "@labo/db/repos/examenes";
import { AuthError, getCurrentUser } from "@labo/lib/server/auth";

import { TitulosNavigator } from "./TitulosNavigator";

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

  const titulos = await titulosList();
  const initialTitulos: TituloListItem[] = titulos.map((titulo) => ({
    id: titulo.id,
    nombre: titulo.nombre,
    orden: titulo.orden,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Exámenes</h1>
          <p className="text-sm text-muted-foreground">
            Gestioná el catálogo por títulos, actualizá precios y prepará la
            importación masiva desde Excel.
          </p>
        </div>
      </div>

      <TitulosNavigator initialTitulos={initialTitulos} />
    </div>
  );
}
