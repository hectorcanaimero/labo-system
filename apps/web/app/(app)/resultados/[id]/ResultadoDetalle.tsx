"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  PencilLine,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@labo/ui/feedback";

import { ResultadoForm } from "../nuevo/ResultadoForm";

interface ResultadoDetalleProps {
  role: string;
  initialData: {
    id: string;
    paciente_id: string;
    fecha_muestra: string;
    fecha_resultado: string | null;
    medico_solicitante: string | null;
    estado: "Pendiente" | "Completado";
    observaciones: string | null;
    created_at: string;
    patient: {
      id: string;
      nombre: string;
      apellido: string;
      cedula: string;
      telefono: string | null;
      email: string | null;
    };
    examenes: Array<{
      examen_id: string;
      nombre_snap: string;
      valor: string;
      observacion: string | null;
      unidad_snap: string | null;
      valores_referencia_snap: string | null;
    }>;
  };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `REQUEST_FAILED_${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function ResultadoDetalle({ role, initialData }: ResultadoDetalleProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isAdmin = role === "admin";

  async function deleteResultado(): Promise<void> {
    const confirmed = window.confirm("¿Seguro que querés eliminar este resultado? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError(null);
      await requestJson(`/api/resultados/${initialData.id}`, { method: "DELETE" });
      router.push("/resultados");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo eliminar el resultado.");
    } finally {
      setDeleting(false);
    }
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Edición</p>
          <h1 className="text-3xl font-bold tracking-tight">Editar resultado</h1>
          <p className="text-sm text-muted-foreground">Actualizá valores, observaciones y fechas manteniendo los snapshots del resultado.</p>
        </div>

        <ResultadoForm
          mode="edit"
          initialData={{
            id: initialData.id,
            paciente_id: initialData.paciente_id,
            paciente: initialData.patient,
            fecha_muestra: initialData.fecha_muestra,
            fecha_resultado: initialData.fecha_resultado,
            medico_solicitante: initialData.medico_solicitante,
            observaciones: initialData.observaciones,
            examenes: initialData.examenes,
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
        <Link href="/resultados" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Volver a resultados
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ficha de resultado</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {initialData.patient.nombre} {initialData.patient.apellido}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Cédula: {initialData.patient.cedula}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
              <PencilLine className="h-4 w-4" />
              Editar
            </Button>
            <Button type="button" onClick={() => window.open(`/api/pdf/resultado/${initialData.id}`, "_blank", "noopener,noreferrer") }>
              <Download className="h-4 w-4" />
              Descargar PDF
            </Button>
            {isAdmin ? (
              <Button type="button" variant="destructive" onClick={() => void deleteResultado()} disabled={deleting}>
                <Trash2 className="h-4 w-4" />
                {deleting ? "Eliminando…" : "Eliminar"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado</p>
            <p className="mt-1 text-sm font-medium text-foreground">{initialData.estado}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fecha de muestra</p>
            <p className="mt-1 text-sm font-medium text-foreground">{formatDate(initialData.fecha_muestra)}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fecha de resultado</p>
            <p className="mt-1 text-sm font-medium text-foreground">{formatDate(initialData.fecha_resultado)}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Médico solicitante</p>
            <p className="mt-1 text-sm font-medium text-foreground">{initialData.medico_solicitante || "No especificado"}</p>
          </div>
        </div>

        {(initialData.patient.telefono || initialData.patient.email || initialData.observaciones) ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Contacto paciente</p>
              <p className="mt-1 text-sm text-foreground">{initialData.patient.telefono || "Sin teléfono"}</p>
              <p className="text-sm text-muted-foreground">{initialData.patient.email || "Sin correo"}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Observaciones generales</p>
              <p className="mt-1 text-sm text-foreground">{initialData.observaciones || "Sin observaciones."}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold">Detalle de exámenes</h2>
          <p className="text-sm text-muted-foreground">Valores observados, unidades y referencias guardadas en el snapshot del resultado.</p>
        </div>

        <div className="p-6">
          {initialData.examenes.length === 0 ? (
            <EmptyState
              compact
              title="Sin exámenes"
              description="Este resultado todavía no tiene líneas cargadas."
              icon={<FileText className="h-5 w-5" />}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {initialData.examenes.map((examen, index) => (
                <article key={`${examen.examen_id}-${index}`} className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-foreground">{examen.nombre_snap}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Valor: <span className="font-medium text-foreground">{examen.valor || "—"}</span>
                        {examen.unidad_snap ? ` ${examen.unidad_snap}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      #{index + 1}
                    </span>
                  </div>

                  {examen.valores_referencia_snap ? (
                    <p className="mt-3 text-xs text-muted-foreground">Referencia: {examen.valores_referencia_snap}</p>
                  ) : null}
                  {examen.observacion ? (
                    <p className="mt-2 text-sm text-muted-foreground">Observación: {examen.observacion}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
