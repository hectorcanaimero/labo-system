import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { pacientesGetWithHistorial } from "@labo/db/repos/pacientes";
import { AuthError, getCurrentUser } from "@labo/lib/server/auth";

import { FichaTabs, type PacienteFichaData } from "./FichaTabs";

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

interface PacienteDetallePageProps {
  params: { id: string };
}

export default async function PacienteDetallePage({ params }: PacienteDetallePageProps) {
  await requireOperadorOrRedirect();

  try {
    const historial = await pacientesGetWithHistorial({ id: params.id });

    const fichaData: PacienteFichaData = {
      paciente: {
        ...historial.paciente,
        fecha_nacimiento: historial.paciente.fecha_nacimiento.toISOString(),
        created_at: historial.paciente.created_at.toISOString(),
        updated_at: historial.paciente.updated_at.toISOString(),
      },
      resultados: historial.resultados.map((resultado) => ({
        ...resultado,
        fecha_muestra: resultado.fecha_muestra.toISOString(),
        fecha_resultado: resultado.fecha_resultado?.toISOString() ?? null,
        created_at: resultado.created_at.toISOString(),
      })),
      presupuestos: historial.presupuestos.map((presupuesto) => ({
        ...presupuesto,
        created_at: presupuesto.created_at.toISOString(),
      })),
    };

    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Link
            href="/pacientes"
            className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a pacientes
          </Link>

          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {fichaData.paciente.nombre} {fichaData.paciente.apellido}
            </h1>
            <p className="text-sm text-muted-foreground">
              Ficha clínica, edad calculada e historial reciente de actividad.
            </p>
          </div>
        </div>

        <FichaTabs data={fichaData} />
      </div>
    );
  } catch (error) {
    if (error instanceof Error && error.message === "PACIENTE_NO_ENCONTRADO") {
      notFound();
    }
    throw error;
  }
}
