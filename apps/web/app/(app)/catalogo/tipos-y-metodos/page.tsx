import { redirect } from "next/navigation";

import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { PageHeader } from "@/components/layout/PageHeader";

import { CatalogoPanel } from "./CatalogoPanel";

export const dynamic = "force-dynamic";

/**
 * Mantenimiento de los catálogos que alimentan los selectores del examen
 * (F7.4.T3). Sólo admin: los endpoints de escritura también lo exigen, así
 * que el guard de acá es la puerta, no la cerradura.
 */
export default async function TiposYMetodosPage() {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin") {
      redirect("/dashboard?reason=sin-permisos");
    }
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.code === "UNAUTHENTICATED" ? "/" : "/dashboard?reason=sin-permisos");
    }
    throw error;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader
        title="Tipos y métodos"
        description="Las listas que ofrece el formulario de examen. Desactivar saca el valor del selector; los exámenes que ya lo tenían lo siguen mostrando."
        back={{ href: "/examenes", label: "Exámenes" }}
      />

      <CatalogoPanel
        titulo="Tipos de análisis"
        descripcion="Clasificación del examen. Es obligatoria al crearlo y agrupa los resultados en el PDF."
        endpoint="/api/examenes/tipos-analisis"
        singular="tipo"
        placeholderNuevo="Ej. Análisis Citogenético"
      />

      <CatalogoPanel
        titulo="Métodos"
        descripcion="Técnica con la que se procesa el examen. Es opcional."
        endpoint="/api/examenes/metodos"
        singular="método"
        placeholderNuevo="Ej. Quimioluminiscencia"
      />
    </div>
  );
}
