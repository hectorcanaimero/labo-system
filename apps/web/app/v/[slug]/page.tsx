import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, MessageCircle } from "lucide-react";

import { get as getConfig } from "@labo/db/repos/config";
import { getVerificacionBySlug } from "@labo/db/repos/enlaces";
import { getById as getPacienteById } from "@labo/db/repos/pacientes";
import { getById as getOrden } from "@labo/db/repos/ordenes";
import { enmascararCedula } from "@labo/lib/cedula";
import { SLUG_PATTERN, normalizarTelefonoWhatsApp } from "@labo/lib/enlace-resultado";
import { formatFechaHoraLab } from "@labo/lib/fecha";
import { Button } from "@/components/ui/button";
import { getAdminDb } from "@/lib/db-server";

/**
 * Vista de verificación de un informe (F7.3.T2).
 *
 * Es a donde apunta el QR impreso en el PDF. Sirve para una sola cosa:
 * confirmar que el informe salió de este laboratorio. NUNCA muestra valores ni
 * el nombre del paciente — a diferencia de `/r/[slug]`, que es el enlace
 * personal, acá el que escanea puede ser cualquiera que tenga el papel en la
 * mano.
 *
 * El slug no vence: el QR queda impreso y se escanea meses después.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificación de informe",
  robots: { index: false, follow: false },
};

export default async function VerificacionPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!SLUG_PATTERN.test(params.slug)) notFound();

  const db = getAdminDb();
  const enlace = await getVerificacionBySlug(db, params.slug);
  if (!enlace) notFound();

  const orden = await getOrden(db, enlace.orden_id);
  // Una orden anulada no verifica nada: 404, igual que un slug inexistente,
  // para no confirmar que existió.
  if (!orden || orden.estado === "Anulada") notFound();

  const [paciente, config] = await Promise.all([
    getPacienteById(db, orden.paciente_id),
    getConfig(db),
  ]);
  if (!paciente) notFound();

  const laboratorio = config?.nombre?.trim() || "Laboratorio";
  const whatsapp = normalizarTelefonoWhatsApp(config?.telefono);
  const emitido = formatFechaHoraLab(orden.fecha_resultado ?? orden.fecha_muestra);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 md:py-16">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {laboratorio}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Verificación de informe</h1>
      </header>

      <section className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Informe auténtico</p>
          <p className="mt-1 text-sm">
            Este informe fue emitido por {laboratorio}.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Laboratorio
            </dt>
            <dd className="text-sm font-medium">{laboratorio}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Fecha y hora de emisión
            </dt>
            <dd className="text-sm font-medium">{emitido}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Cédula del paciente
            </dt>
            <dd className="text-sm font-medium">{enmascararCedula(paciente.cedula)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">¿Algo no coincide?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Si los datos del papel que tenés no coinciden con los de esta página, escribinos
          y lo revisamos.
        </p>
        {whatsapp ? (
          <Button asChild className="mt-4">
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-4 w-4" />
              Escribir por WhatsApp
            </a>
          </Button>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Comunicate con {laboratorio} por los medios habituales.
          </p>
        )}
      </section>

      <p className="pb-8 text-xs text-muted-foreground">
        Esta página sólo confirma la autenticidad del informe. Por privacidad no muestra los
        resultados ni los datos completos del paciente.
      </p>
    </main>
  );
}
