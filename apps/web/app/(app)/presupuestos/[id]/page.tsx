import { notFound, redirect } from "next/navigation";

import { getById } from "@labo/db/repos/presupuestos";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { PresupuestoDetalle } from "./PresupuestoDetalle";

async function requireOperadorOrRedirect(): Promise<{ role: string }> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") {
      redirect("/dashboard?reason=sin-permisos");
    }
    return { role: user.role };
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.code === "UNAUTHENTICATED" ? "/login" : "/dashboard?reason=sin-permisos");
    }
    throw error;
  }
}

export default async function PresupuestoDetallePage({ params }: { params: { id: string } }) {
  const { role } = await requireOperadorOrRedirect();
  const presupuesto = await getById(getAdminDb(), params.id);
  if (!presupuesto) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PresupuestoDetalle
        role={role}
        initialData={{
          id: presupuesto.id,
          numero_correlativo: presupuesto.numero_correlativo,
          paciente_id: presupuesto.paciente_id,
          paciente_nombre_libre: presupuesto.paciente_nombre_libre,
          paciente_nombre: presupuesto.paciente_nombre,
          paciente_apellido: presupuesto.paciente_apellido,
          descuento_pct: presupuesto.descuento_pct,
          ganancia_pct: presupuesto.ganancia_pct,
          tasa_bs: presupuesto.tasa_bs,
          toma_muestra_usd: presupuesto.toma_muestra_usd,
          domicilio_usd: presupuesto.domicilio_usd,
          total_usd: presupuesto.total_usd,
          total_bs: presupuesto.total_bs,
          estado: presupuesto.estado,
          orden_id: presupuesto.orden_id,
          created_at: presupuesto.created_at,
          lineas: presupuesto.lineas.map((linea) => ({
            id: linea.id,
            examen_id: linea.examen_id,
            nombre_snap: linea.nombre_snap,
            precio_snap: linea.precio_snap,
            orden: linea.orden,
          })),
        }}
      />
    </div>
  );
}
