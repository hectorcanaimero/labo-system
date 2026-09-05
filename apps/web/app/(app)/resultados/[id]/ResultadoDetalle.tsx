"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Download,
  FileText,
  PencilLine,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@labo/ui/feedback";

import { EnviarResultadoButtons } from "./EnviarResultadoButtons";
import { ResultadoForm } from "../nuevo/ResultadoForm";
import { PageHeader } from "@/components/layout/PageHeader";

interface ResultadoDetalleProps {
  role: string;
  initialData: {
    id: string;
    paciente_id: string;
    fecha_muestra: string;
    fecha_resultado: string | null;
    medico_solicitante: string | null;
    estado: "Registrada" | "Muestra tomada" | "En proceso" | "Validando" | "Entregada" | "Anulada";
    observaciones: string | null;
    origen_presupuesto_id: string | null;
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
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Editar orden"
          description="Actualizá valores, observaciones y fechas manteniendo los snapshots del resultado."
          back={{ href: "/resultados", label: "Órdenes" }}
        />

        <ResultadoForm
          mode="edit"
          initialData={{
            id: initialData.id,
            paciente_id: initialData.paciente_id,
            paciente: initialData.patient,
            fecha_muestra: initialData.fecha_muestra,
            fecha_resultado: initialData.fecha_resultado,
            medico_solicitante: initialData.medico_solicitante,
            estado: initialData.estado,
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
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${initialData.patient.nombre} ${initialData.patient.apellido}`}
        count={initialData.patient.cedula}
        description="Ficha de la orden: estado, fechas, contacto y exámenes."
        back={{ href: "/resultados", label: "Órdenes" }}
        actions={
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              <PencilLine className="h-3.5 w-3.5" />
              Editar
            </Button>
            <Button type="button" size="sm" onClick={() => window.open(`/api/pdf/resultado/${initialData.id}`, "_blank", "noopener,noreferrer") }>
              <Download className="h-3.5 w-3.5" />
              Descargar PDF
            </Button>
            <EnviarResultadoButtons
              ordenId={initialData.id}
              telefono={initialData.patient.telefono}
              email={initialData.patient.email}
            />
            {isAdmin ? (
              <Button type="button" size="sm" variant="destructive" onClick={() => void deleteResultado()} disabled={deleting}>
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Eliminando…" : "Eliminar"}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-md border border-border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado</p>
            <p className="mt-1 text-sm font-medium text-foreground">{initialData.estado}</p>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fecha de muestra</p>
            <p className="mt-1 text-sm font-medium text-foreground">{formatDate(initialData.fecha_muestra)}</p>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fecha de resultado</p>
            <p className="mt-1 text-sm font-medium text-foreground">{formatDate(initialData.fecha_resultado)}</p>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Médico solicitante</p>
            <p className="mt-1 text-sm font-medium text-foreground">{initialData.medico_solicitante || "No especificado"}</p>
          </div>
        </div>

        {(initialData.patient.telefono || initialData.patient.email || initialData.observaciones) ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Contacto paciente</p>
              <p className="mt-1 text-sm text-foreground">{initialData.patient.telefono || "Sin teléfono"}</p>
              <p className="text-sm text-muted-foreground">{initialData.patient.email || "Sin correo"}</p>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Observaciones generales</p>
              <p className="mt-1 text-sm text-foreground">{initialData.observaciones || "Sin observaciones."}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-6 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Detalle de exámenes</h2>
            <p className="text-sm text-muted-foreground">Valores observados, unidades y referencias guardadas en el snapshot del resultado.</p>
          </div>
          {initialData.origen_presupuesto_id ? (
            <Link
              href={`/presupuestos/${initialData.origen_presupuesto_id}`}
              className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Ver el presupuesto que originó esta orden"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Precargados desde presupuesto
              <span className="font-mono text-[10px] text-muted-foreground/70">
                #{initialData.origen_presupuesto_id.slice(0, 8)}
              </span>
            </Link>
          ) : null}
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
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="w-12 px-4 py-3 text-center font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Examen</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Unidad</th>
                    <th className="px-4 py-3 font-medium">Referencia</th>
                    <th className="px-4 py-3 font-medium">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {initialData.examenes.map((examen, index) => (
                    <tr key={`${examen.examen_id}-${index}`} className="align-top">
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{examen.nombre_snap}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{examen.valor || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{examen.unidad_snap || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {examen.valores_referencia_snap || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {examen.observacion || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
