import { redirect } from "next/navigation";

import { list } from "@labo/db/repos/paquetes";
import { AuthError, getCurrentUser, type CurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { PaquetesList } from "./PaquetesList";

// Se carga en el servidor: antes el navegador bajaba el JS y recién ahí
// pedía /api/paquetes y /api/me, en cadena.
async function requireOperadorOrRedirect(): Promise<CurrentUser> {
  try {
    const user = await getCurrentUser();
    if (user.role !== "admin" && user.role !== "operador") {
      redirect("/dashboard?reason=sin-permisos");
    }
    return user;
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.code === "UNAUTHENTICATED" ? "/login" : "/dashboard?reason=sin-permisos");
    }
    throw error;
  }
}

export default async function PaquetesPage() {
  const user = await requireOperadorOrRedirect();
  const paquetes = await list(getAdminDb());

  return <PaquetesList initialPaquetes={paquetes} role={user.role} />;
}
