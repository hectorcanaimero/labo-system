import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { get as getConfig } from "@labo/db/repos/config";
import { getBySlug } from "@labo/db/repos/enlaces";
import { getById as getPacienteById } from "@labo/db/repos/pacientes";
import { getById as getOrden } from "@labo/db/repos/ordenes";
import { SLUG_PATTERN } from "@labo/lib/enlace-resultado";
import { Button } from "@/components/ui/button";
import { getAdminDb } from "@/lib/db-server";

/**
 * Ficha pública de resultados (GUR-18).
 *
 * Ruta anónima: el slug ES la credencial, por eso se resuelve con el cliente
 * admin (RLS bloquea la anon key) y se responde 404 tanto si el enlace no
 * existe como si venció — así no se puede sondear qué órdenes existen.
 *
 * `noindex` para que los buscadores no cacheen datos clínicos.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resultados de laboratorio",
  robots: { index: false, follow: false },
};

function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-VE", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(value),
  );
}

/**
 * Enmascara la cédula dejando visibles solo los últimos dos dígitos, con los
 * mismos grupos de miles que se usarían al mostrarla completa (ej.
 * `V-12345678` → `V-***.***.*78`).
 */
function maskCedula(cedula: string): string {
  const match = /^([VEJGP])-(\d+)$/.exec(cedula);
  if (!match) return cedula;
  const [, prefix, digits] = match;

  const groupLengths: number[] = [];
  let remaining = digits.length;
  while (remaining > 3) {
    groupLengths.unshift(3);
    remaining -= 3;
  }
  groupLengths.unshift(remaining);

  const visibleCount = Math.min(2, digits.length);
  const masked =
    "*".repeat(digits.length - visibleCount) + digits.slice(digits.length - visibleCount);

  const groups: string[] = [];
  let cursor = 0;
  for (const length of groupLengths) {
    groups.push(masked.slice(cursor, cursor + length));
    cursor += length;
  }

  return `${prefix}-${groups.join(".")}`;
}

export default async function ResultadoPublicoPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!SLUG_PATTERN.test(params.slug)) notFound();

  const db = getAdminDb();
  const enlace = await getBySlug(db, params.slug);
  if (!enlace) notFound();

  const orden = await getOrden(db, enlace.orden_id);
  if (!orden || orden.estado === "Anulada") notFound();

  const [paciente, config] = await Promise.all([
    getPacienteById(db, orden.paciente_id),
    getConfig(db),
  ]);
  if (!paciente) notFound();

  const laboratorio = config?.nombre?.trim() || "Laboratorio";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:py-12">
      <header className="flex flex-col gap-1 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {laboratorio}
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Resultados de laboratorio
        </h1>
        {config?.telefono || config?.email ? (
          <p className="text-sm text-muted-foreground">
            {[config?.telefono, config?.email].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">
          {paciente.nombre} {paciente.apellido}
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Cédula</dt>
            <dd className="text-sm font-medium">{maskCedula(paciente.cedula)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Estado</dt>
            <dd className="text-sm font-medium">{orden.estado}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Fecha de muestra
            </dt>
            <dd className="text-sm font-medium">{formatDate(orden.fecha_muestra)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Fecha de resultado
            </dt>
            <dd className="text-sm font-medium">{formatDate(orden.fecha_resultado)}</dd>
          </div>
          {orden.medico_solicitante ? (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Médico solicitante
              </dt>
              <dd className="text-sm font-medium">{orden.medico_solicitante}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Resultado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Por su privacidad, los valores del resultado no se muestran en esta página.
          Descargue el PDF para verlos.
        </p>
        <Button asChild className="mt-4">
          <a href={`/api/r/${params.slug}/pdf`} download={`resultado-${params.slug}.pdf`}>
            <Download className="h-4 w-4" />
            Descargar resultado (PDF)
          </a>
        </Button>
      </section>

      {orden.observaciones ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Observaciones
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm">{orden.observaciones}</p>
        </section>
      ) : null}

      <p className="pb-8 text-xs text-muted-foreground">
        Este informe es de carácter personal y confidencial. Los resultados deben ser
        interpretados por su médico tratante. Enlace válido hasta el{" "}
        {formatDate(enlace.expira_en)}.
      </p>
    </main>
  );
}
