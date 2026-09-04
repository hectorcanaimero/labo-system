import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { get as getConfig } from "@labo/db/repos/config";
import { getBySlug } from "@labo/db/repos/enlaces";
import { getById as getPacienteById } from "@labo/db/repos/pacientes";
import { getById as getOrden } from "@labo/db/repos/ordenes";
import { SLUG_PATTERN } from "@labo/lib/enlace-resultado";
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
            <dd className="text-sm font-medium">{paciente.cedula}</dd>
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

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Detalle de exámenes</h2>
        </div>

        {/* Tabla en desktop, tarjetas en móvil: el enlace llega casi siempre por WhatsApp. */}
        <div className="hidden overflow-x-auto p-5 md:block">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Examen</th>
                <th className="px-3 py-2 font-medium">Resultado</th>
                <th className="px-3 py-2 font-medium">Unidad</th>
                <th className="px-3 py-2 font-medium">Valores de referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orden.examenes.map((examen) => (
                <tr key={examen.id} className="align-top">
                  <td className="px-3 py-2 font-medium">{examen.nombre_snap}</td>
                  <td className="px-3 py-2 font-medium">{examen.valor || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{examen.unidad_snap || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {examen.valores_referencia_snap || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="flex flex-col divide-y divide-border md:hidden">
          {orden.examenes.map((examen) => (
            <li key={examen.id} className="flex flex-col gap-1 p-5">
              <p className="font-medium">{examen.nombre_snap}</p>
              <p className="text-sm">
                <span className="font-semibold">{examen.valor || "—"}</span>{" "}
                <span className="text-muted-foreground">{examen.unidad_snap || ""}</span>
              </p>
              {examen.valores_referencia_snap ? (
                <p className="text-xs text-muted-foreground">
                  Referencia: {examen.valores_referencia_snap}
                </p>
              ) : null}
              {examen.observacion ? (
                <p className="text-xs text-muted-foreground">{examen.observacion}</p>
              ) : null}
            </li>
          ))}
        </ul>
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
