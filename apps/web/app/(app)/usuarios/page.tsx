import { redirect } from "next/navigation";

import { listAll } from "@labo/db/repos/usuarios";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { UsuariosList, type UsuarioItem } from "./UsuariosList";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Usuarios — RV Laboratorio",
};

export default async function UsuariosPage() {
  let user;
  try {
    user = await getCurrentUser();
    if (user.role !== "admin") {
      redirect("/dashboard?reason=sin-permisos");
    }
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.code === "UNAUTHENTICATED" ? "/" : "/dashboard?reason=sin-permisos");
    }
    throw error;
  }

  const usuarios = await listAll(getAdminDb());
  const initialUsuarios: UsuarioItem[] = usuarios.map((u) => ({
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    role: u.role,
    activo: u.activo,
    created_at: u.created_at,
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        title="Usuarios"
        count={initialUsuarios.length}
        description="Gestioná accesos: invitá operadores o admins, cambiá roles y controlá actividad."
      />

      <UsuariosList currentUserId={user.userId} initialUsuarios={initialUsuarios} />
    </div>
  );
}
