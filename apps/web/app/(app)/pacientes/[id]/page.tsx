import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { pacientesGetWithHistorial } from "@labo/db/repos/pacientes";
import { getDb } from "@/lib/db-server";
import { AuthError, getCurrentUser } from "@/lib/server/auth";

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
    const historial = await pacientesGetWithHistorial(getDb(), { id: params.id });

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
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-col gap-2 border-b border-border pb-3">
          <Link
            href="/pacientes"
            className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Pacientes
          </Link>
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {fichaData.paciente.nombre} {fichaData.paciente.apellido}
            </h1>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {fichaData.paciente.cedula}
            </span>
          </div>
        </header>

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
