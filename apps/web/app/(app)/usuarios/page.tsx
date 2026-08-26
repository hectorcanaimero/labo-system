import { redirect } from "next/navigation";

import { getSql } from "@labo/db/client";
import { listAll } from "@labo/db/repos/usuarios";
import { AuthError, getCurrentUser } from "@/lib/server/auth";

import { UsuariosList, type UsuarioItem } from "./UsuariosList";

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

  const usuarios = await listAll(getSql());
  const initialUsuarios: UsuarioItem[] = usuarios.map((u) => ({
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    role: u.role,
    activo: u.activo,
    created_at: u.created_at.toISOString(),
  }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Gestioná los accesos al sistema: invitá operadores o administradores,
          cambiá roles y controlá quién está activo.
        </p>
      </div>

      <UsuariosList currentUserId={user.userId} initialUsuarios={initialUsuarios} />
    </div>
  );
}
