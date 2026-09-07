import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { get as getConfig } from "@labo/db/repos/config";
import { getPresupuestoBySlug } from "@labo/db/repos/enlaces";
import { getById as getPresupuesto } from "@labo/db/repos/presupuestos";
import { formatBs, formatUsd } from "@labo/lib/bs-format";
import { SLUG_PATTERN } from "@labo/lib/enlace-resultado";
import { formatNumeroPresupuesto } from "@labo/lib/numero-presupuesto";
import { Button } from "@/components/ui/button";
import { getAdminDb } from "@/lib/db-server";

/**
 * Ficha pública de un presupuesto (F7.2.T7), espejo de `/r/[slug]` (GUR-18).
 *
 * Ruta anónima: el slug ES la credencial, por eso se resuelve con el cliente
 * admin (RLS bloquea la anon key) y se responde 404 tanto si el enlace no
 * existe como si venció o el presupuesto se canceló — así no se puede
 * sondear qué presupuestos existen.
 *
 * `noindex` para que los buscadores no cacheen precios/datos del paciente.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presupuesto",
  robots: { index: false, follow: false },
};

function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-VE", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(value),
  );
}

export default async function PresupuestoPublicoPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!SLUG_PATTERN.test(params.slug)) notFound();

  const db = getAdminDb();
  const enlace = await getPresupuestoBySlug(db, params.slug);
  if (!enlace) notFound();

  const presupuesto = await getPresupuesto(db, enlace.presupuesto_id);
  if (!presupuesto || presupuesto.estado === "Cancelado") notFound();

  const config = await getConfig(db);
  const laboratorio = config?.nombre?.trim() || "Laboratorio";
  const pacienteNombre =
    [presupuesto.paciente_nombre, presupuesto.paciente_apellido].filter(Boolean).join(" ") ||
    presupuesto.paciente_nombre_libre ||
    "Paciente";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:py-12">
      <header className="flex flex-col gap-1 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {laboratorio}
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Presupuesto</h1>
        {config?.telefono || config?.email ? (
          <p className="text-sm text-muted-foreground">
            {[config?.telefono, config?.email].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{pacienteNombre}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Número</dt>
            <dd className="text-sm font-medium">
              {formatNumeroPresupuesto(presupuesto.numero_correlativo, presupuesto.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Fecha</dt>
            <dd className="text-sm font-medium">{formatDate(presupuesto.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Total USD</dt>
            <dd className="text-sm font-medium">{formatUsd(presupuesto.total_usd)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Total Bs</dt>
            <dd className="text-sm font-medium">{formatBs(presupuesto.total_bs)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Detalle</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          El detalle de exámenes y precios está en el documento. Descargue el PDF para verlo.
        </p>
        <Button asChild className="mt-4">
          <a href={`/api/p/${params.slug}/pdf`} download={`presupuesto-${params.slug}.pdf`}>
            <Download className="h-4 w-4" />
            Descargar presupuesto (PDF)
          </a>
        </Button>
      </section>

      <p className="pb-8 text-xs text-muted-foreground">
        Esta cotización tiene una validez de 24 horas desde su emisión. Este enlace es personal y
        estará disponible hasta el {formatDate(enlace.expira_en)}.
      </p>
    </main>
  );
}
