import { notFound, redirect } from "next/navigation";

import { getById } from "@labo/db/repos/presupuestos";
import { get as getConfig } from "@labo/db/repos/config";
import { getLatest } from "@labo/db/repos/tasa";
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
  const db = getAdminDb();
  const [presupuesto, latest, config] = await Promise.all([
    getById(db, params.id),
    getLatest(db),
    getConfig(db),
  ]);
  if (!presupuesto) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PresupuestoDetalle
        role={role}
        vigenteTasa={
          latest
            ? { tasa: latest.tasa, fuente: latest.fuente, scraped_at: latest.scraped_at }
            : null
        }
        gananciaDefault={config?.ganancia_default_pct ?? 0}
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
          // `paquete_id`, `precio_base_snap` y `ganancia_pct` son necesarios
          // para reconstruir las líneas al editar: sin ellos un paquete
          // cerrado vuelve como líneas sueltas y al guardar se le aplica otra
          // vez la ganancia global sobre el precio ya repartido.
          lineas: presupuesto.lineas.map((linea) => ({
            id: linea.id,
            examen_id: linea.examen_id,
            nombre_snap: linea.nombre_snap,
            precio_snap: linea.precio_snap,
            orden: linea.orden,
            paquete_id: linea.paquete_id,
            precio_base_snap: linea.precio_base_snap,
            ganancia_pct: linea.ganancia_pct,
            cerrado: linea.cerrado,
          })),
        }}
      />
    </div>
  );
}
