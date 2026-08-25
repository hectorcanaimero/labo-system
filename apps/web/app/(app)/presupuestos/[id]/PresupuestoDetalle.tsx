"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  PencilLine,
  Send,
  UserRound,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@labo/ui/feedback";
import { formatBs, formatUsd } from "@labo/lib/bs-format";
import { toHumanError } from "@labo/lib/error-messages";

import { PresupuestoForm } from "../nuevo/PresupuestoForm";

type EstadoPresupuesto = "Borrador" | "Aprobado" | "Convertido";

interface PresupuestoDetalleProps {
  role: string;
  initialData: {
    id: string;
    paciente_id: string | null;
    paciente_nombre_libre: string | null;
    paciente_nombre: string | null;
    paciente_apellido: string | null;
    descuento_pct: number;
    ganancia_pct: number;
    tasa_bs: number;
    total_usd: number;
    total_bs: number;
    estado: EstadoPresupuesto;
    resultado_id: string | null;
    created_at: string;
    lineas: Array<{
      id: string;
      examen_id: string;
      nombre_snap: string;
      precio_snap: number;
      orden: number;
    }>;
  };
}

function formatDate(value: string): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-VE", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `REQUEST_FAILED_${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function PresupuestoDetalle({ initialData }: PresupuestoDetalleProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isBorrador = initialData.estado === "Borrador";
  const isAprobado = initialData.estado === "Aprobado";
  const esNombreLibre = !initialData.paciente_id;

  const pacienteLabel = initialData.paciente_id
    ? `${initialData.paciente_nombre || ""} ${initialData.paciente_apellido || ""}`.trim()
    : initialData.paciente_nombre_libre || "Nombre libre";

  async function aprobar(): Promise<void> {
    try {
      setApproving(true);
      setError(null);
      await requestJson(`/api/presupuestos/${initialData.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "Aprobado" }),
      });
      router.refresh();
    } catch (reason) {
      setError(toHumanError(reason));
    } finally {
      setApproving(false);
    }
  }

  async function convertir(): Promise<void> {
    try {
      setConverting(true);
      setError(null);
      const result = await requestJson<{ resultado_id: string }>(
        `/api/presupuestos/${initialData.id}/convertir`,
        { method: "POST" },
      );
      setConfirmOpen(false);
      router.push(`/resultados/${result.resultado_id}`);
      router.refresh();
    } catch (reason) {
      setError(toHumanError(reason));
      setConverting(false);
    }
  }

  function descargarPdf(): void {
    window.open(`/api/pdf/presupuesto/${initialData.id}`, "_blank", "noopener,noreferrer");
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Edición</p>
          <h1 className="text-3xl font-bold tracking-tight">Editar presupuesto</h1>
          <p className="text-sm text-muted-foreground">
            Actualizá paciente, exámenes, descuento y tasa mientras el presupuesto siga en Borrador.
          </p>
        </div>

        <PresupuestoForm
          mode="edit"
          initialData={{
            id: initialData.id,
            paciente_id: initialData.paciente_id,
            paciente_nombre_libre: initialData.paciente_nombre_libre,
            paciente_nombre: initialData.paciente_nombre,
            paciente_apellido: initialData.paciente_apellido,
            descuento_pct: initialData.descuento_pct,
            ganancia_pct: initialData.ganancia_pct,
            tasa_bs: initialData.tasa_bs,
            estado: initialData.estado,
            lineas: initialData.lineas,
          }}
          onCancelEdit={() => setIsEditing(false)}
          onSaved={() => {
            setIsEditing(false);
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href="/presupuestos"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a presupuestos
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Presupuesto
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{pacienteLabel}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <UserRound className="h-4 w-4" />
              {initialData.paciente_id
                ? "Paciente registrado"
                : "Paciente con nombre libre (sin ficha)"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isBorrador ? (
              <>
                <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
                  <PencilLine className="h-4 w-4" />
                  Editar
                </Button>
                <Button type="button" onClick={() => void aprobar()} disabled={approving}>
                  <CheckCircle2 className="h-4 w-4" />
                  {approving ? "Aprobando…" : "Aprobar"}
                </Button>
              </>
            ) : null}

            {isAprobado ? (
              <Button type="button" onClick={() => setConfirmOpen(true)}>
                <Send className="h-4 w-4" />
                Convertir a Resultado
              </Button>
            ) : null}

            <Button type="button" variant="outline" onClick={descargarPdf}>
              <Download className="h-4 w-4" />
              Descargar PDF
            </Button>

            {initialData.resultado_id ? (
              <Link href={`/resultados/${initialData.resultado_id}`}>
                <Button type="button" variant="secondary">
                  <FileText className="h-4 w-4" />
                  Ver resultado
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado</p>
            <p className="mt-1 text-sm font-medium text-foreground">{initialData.estado}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fecha</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {formatDate(initialData.created_at)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tasa Bs</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {formatBs(initialData.tasa_bs)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Descuento</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {initialData.descuento_pct}%
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total USD</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">
              {formatUsd(initialData.total_usd)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Bs</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">
              {formatBs(initialData.total_bs)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ganancia</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">
              {initialData.ganancia_pct}%
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold">Detalle de exámenes</h2>
          <p className="text-sm text-muted-foreground">
            Precios en snapshot al momento de armar el presupuesto.
          </p>
        </div>

        <div className="p-6">
          {initialData.lineas.length === 0 ? (
            <EmptyState
              compact
              title="Sin exámenes"
              description="Este presupuesto todavía no tiene líneas cargadas."
              icon={<FileText className="h-5 w-5" />}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Examen</th>
                    <th className="px-4 py-3 text-right font-medium">Precio USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {initialData.lineas.map((linea, index) => (
                    <tr key={linea.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <span className="mr-2 text-muted-foreground">#{index + 1}</span>
                        {linea.nombre_snap}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatUsd(linea.precio_snap)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
            {esNombreLibre ? (
              <>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  <div>
                    <h3 className="text-lg font-semibold">Primero creá la ficha del paciente</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Este presupuesto usa el nombre libre &ldquo;
                      <span className="font-medium text-foreground">
                        {initialData.paciente_nombre_libre}
                      </span>
                      &rdquo;. Para convertirlo en resultado necesitás una ficha de paciente
                      registrado.
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
                    Cerrar
                  </Button>
                  <Link href="/pacientes">
                    <Button type="button">
                      <UserRound className="h-4 w-4" />
                      Crear ficha
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Convertir a Resultado</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Se creará un resultado en estado <strong>Pendiente</strong> con los exámenes
                      de este presupuesto. El presupuesto pasará a <strong>Convertido</strong>.
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmOpen(false)}
                    disabled={converting}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" onClick={() => void convertir()} disabled={converting}>
                    {converting ? "Convirtiendo…" : "Confirmar conversión"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
