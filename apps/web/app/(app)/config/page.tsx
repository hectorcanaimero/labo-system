import { redirect } from "next/navigation";

import { get as getConfig } from "@labo/db/repos/config";
import { getLatest } from "@labo/db/repos/tasa";
import { AuthError, getCurrentUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/db-server";

import { ConfigForm, type ConfigPreloaded, type TasaPreloaded } from "./ConfigForm";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
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

  const db = getAdminDb();
  const config = await getConfig(db);
  const latest = await getLatest(db);

  const preloadedConfig: ConfigPreloaded | null = config
    ? {
        nombre: config.nombre,
        direccion: config.direccion,
        telefono: config.telefono,
        email: config.email,
        rif: config.rif,
        colegio_bioanalistas: config.colegio_bioanalistas,
        mpps: config.mpps,
        pdf_pie_pagina: config.pdf_pie_pagina,
        toma_muestra_default_usd: config.toma_muestra_default_usd,
      }
    : null;

  const preloadedTasa: TasaPreloaded | null = latest
    ? {
        tasa: latest.tasa,
        fuente: latest.fuente,
        scraped_at: latest.scraped_at,
        motivo: latest.motivo,
        stale: latest.stale,
      }
    : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        title="Configuración"
        description="Identidad del laboratorio, contacto, assets y tasa de cambio."
      />
      <ConfigForm preloadedConfig={preloadedConfig} preloadedTasa={preloadedTasa} />
    </div>
  );
}
