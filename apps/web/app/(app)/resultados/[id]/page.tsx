import { notFound, redirect } from "next/navigation";

import { getById as getPacienteById } from "@labo/db/repos/pacientes";
import { getById } from "@labo/db/repos/resultados";
import { AuthError, getCurrentUser } from "@labo/lib/server/auth";

import { ResultadoDetalle } from "./ResultadoDetalle";

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

export default async function ResultadoDetallePage({ params }: { params: { id: string } }) {
  const { role } = await requireOperadorOrRedirect();
  const resultado = await getById(params.id);
  if (!resultado) notFound();

  const paciente = await getPacienteById(resultado.paciente_id);
  if (!paciente) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <ResultadoDetalle
        role={role}
        initialData={{
          id: resultado.id,
          paciente_id: resultado.paciente_id,
          fecha_muestra: resultado.fecha_muestra.toISOString(),
          fecha_resultado: resultado.fecha_resultado?.toISOString() ?? null,
          medico_solicitante: resultado.medico_solicitante,
          estado: resultado.estado,
          observaciones: resultado.observaciones,
          created_at: resultado.created_at.toISOString(),
          patient: {
            id: paciente.id,
            nombre: paciente.nombre,
            apellido: paciente.apellido,
            cedula: paciente.cedula,
            telefono: paciente.telefono,
            email: paciente.email,
          },
          examenes: resultado.examenes.map((linea) => ({
            ...linea,
            observacion: linea.observacion ?? null,
            unidad_snap: linea.unidad_snap ?? null,
            valores_referencia_snap: linea.valores_referencia_snap ?? null,
          })),
        }}
      />
    </div>
  );
}
