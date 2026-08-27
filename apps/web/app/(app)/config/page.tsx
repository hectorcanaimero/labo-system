import { getSql } from "@labo/db/client";
import { get as getConfig } from "@labo/db/repos/config";
import { getLatest } from "@labo/db/repos/tasa";

import { ConfigForm, type ConfigPreloaded, type TasaPreloaded } from "./ConfigForm";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const config = await getConfig();
  const latest = await getLatest(getSql());

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
        scraped_at: latest.scraped_at.toISOString(),
        motivo: latest.motivo,
        stale: latest.stale,
      }
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración del Laboratorio</h1>
        <p className="text-muted-foreground text-sm">
          Gestioná la identidad del laboratorio, datos de contacto, firmas, sellos, tasas de cambio y usuarios.
        </p>
      </div>
      <ConfigForm
        preloadedConfig={preloadedConfig}
        preloadedTasa={preloadedTasa}
      />
    </div>
  );
}
