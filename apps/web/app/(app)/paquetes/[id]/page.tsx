import { notFound, redirect } from "next/navigation";

import { getById } from "@labo/db/repos/paquetes";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { PaqueteBuilder, type PaqueteBuilderData } from "../PaqueteBuilder";

async function requireOperador() {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") redirect("/dashboard?reason=sin-permisos");
    return user;
  } catch (error) {
    if (error instanceof AuthError) redirect(error.code === "UNAUTHENTICATED" ? "/login" : "/dashboard?reason=sin-permisos");
    throw error;
  }
}

export default async function PaqueteDetailPage({ params }: { params: { id: string } }) {
  const user = await requireOperador();
  const paquete = await getById(params.id);
  if (!paquete) notFound();

  const initialData: PaqueteBuilderData = {
    id: paquete.id,
    nombre: paquete.nombre,
    descripcion: paquete.descripcion,
    precio_base: paquete.precio_base,
    examenes: paquete.examenes,
  };
  return <PaqueteBuilder initialData={initialData} canEdit={user.role === "admin"} />;
}
