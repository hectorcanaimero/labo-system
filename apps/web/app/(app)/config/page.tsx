import { get as getConfig } from "@labo/db/repos/config";
import { getLatest } from "@labo/db/repos/tasa";
import { getAdminDb } from "@/lib/db-server";

import { ConfigForm, type ConfigPreloaded, type TasaPreloaded } from "./ConfigForm";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
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
      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Configuración
        </h1>
        <p className="text-xs text-muted-foreground">
          Identidad del laboratorio, contacto, assets y tasa de cambio.
        </p>
      </header>
      <ConfigForm preloadedConfig={preloadedConfig} preloadedTasa={preloadedTasa} />
    </div>
  );
}
