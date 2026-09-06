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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@labo/ui/feedback";
import { PresupuestoEstadoBadge } from "@labo/ui/presupuestos/PresupuestoEstadoBadge";
import {
  PacienteAutocomplete,
  type PacienteAutocompleteItem,
} from "@labo/ui/pacientes/PacienteAutocomplete";
import { formatBs, formatUsd } from "@labo/lib/bs-format";
import { toHumanError } from "@labo/lib/error-messages";
import { formatNumeroPresupuesto } from "@labo/lib/numero-presupuesto";
import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";

// String de error del backend — inline para no arrastrar el repo del server
// (`@labo/db/repos/presupuestos` importa `@insforge/sdk` y rompería el bundle
// del cliente al traer contexts server-only).
const PACIENTE_LIBRE_REQUIERE_FICHA = "PACIENTE_LIBRE_REQUIERE_FICHA";

import { PresupuestoForm } from "../nuevo/PresupuestoForm";
import { PageHeader } from "@/components/layout/PageHeader";

interface PresupuestoDetalleProps {
  role: string;
  initialData: {
    id: string;
    numero_correlativo: number;
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
    orden_id: string | null;
    created_at: string;
    lineas: Array<{
      id: string;
      examen_id: string;
      nombre_snap: string;
      precio_snap: number;
      orden: number;
      paquete_id?: string | null;
      precio_base_snap?: number;
      ganancia_pct?: number;
      precio_final_snap?: number;
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
  const [pacienteAsignado, setPacienteAsignado] = useState<PacienteAutocompleteItem | null>(null);

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

  async function convertir(pacienteId?: string): Promise<void> {
    try {
      setConverting(true);
      setError(null);
      const result = await requestJson<{ orden_id: string }>(
        `/api/presupuestos/${initialData.id}/convertir`,
        {
          method: "POST",
          body: pacienteId ? JSON.stringify({ paciente_id: pacienteId }) : undefined,
        },
      );
      setConfirmOpen(false);
      setPacienteAsignado(null);
      router.push(`/resultados/${result.orden_id}`);
      router.refresh();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      // El backend nos avisa que este presupuesto es libre y necesita ficha.
      // Abrimos el modal de asignación en vez de mostrar el error crudo.
      if (message === PACIENTE_LIBRE_REQUIERE_FICHA) {
        // Fallback: reabrimos el modal (el caso libre se ofrece resolver
        // ahí mismo con el autocomplete).
        setConfirmOpen(true);
        setConverting(false);
        return;
      }
      setError(toHumanError(reason));
      setConverting(false);
    }
  }

  function descargarPdf(): void {
    window.open(`/api/pdf/presupuesto/${initialData.id}`, "_blank", "noopener,noreferrer");
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Editar presupuesto"
          description="Actualizá paciente, exámenes, descuento y tasa mientras el presupuesto siga en Borrador."
          back={{ href: "/presupuestos", label: "Presupuestos" }}
        />

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
    <div className="flex flex-col gap-4">
      {/* Header compacto */}
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <Link
          href="/presupuestos"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Presupuestos
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {pacienteLabel}
              </h1>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {formatNumeroPresupuesto(
                  initialData.numero_correlativo,
                  initialData.created_at,
                )}
              </span>
              <PresupuestoEstadoBadge estado={initialData.estado} />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRound className="h-3 w-3" />
              {initialData.paciente_id
                ? "Paciente registrado"
                : "Nombre libre (sin ficha)"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isBorrador ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setIsEditing(true)}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={() => void aprobar()}
                  disabled={approving}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {approving ? "Aprobando…" : "Aprobar"}
                </Button>
              </>
            ) : null}

            {isAprobado ? (
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={() => setConfirmOpen(true)}
              >
                <Send className="h-3.5 w-3.5" />
                Convertir en orden
              </Button>
            ) : null}

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={descargarPdf}
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </Button>

            {initialData.orden_id ? (
              <Link href={`/resultados/${initialData.orden_id}`}>
                <Button type="button" size="sm" variant="secondary" className="h-8">
                  <FileText className="h-3.5 w-3.5" />
                  Ver orden
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {/* Metadata denso */}
      <Card className="shadow-none">
        <CardContent className="p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <MetaCell label="Fecha" mono>{formatDate(initialData.created_at)}</MetaCell>
            <MetaCell label="Tasa Bs" mono>{formatBs(initialData.tasa_bs)}</MetaCell>
            <MetaCell label="Descuento" mono>{initialData.descuento_pct}%</MetaCell>
            <MetaCell label="Ganancia" mono>{initialData.ganancia_pct}%</MetaCell>
            <MetaCell label="Total USD" mono strong>
              {formatUsd(initialData.total_usd)}
            </MetaCell>
            <MetaCell label="Total Bs" mono strong>
              {formatBs(initialData.total_bs)}
            </MetaCell>
          </dl>
        </CardContent>
      </Card>

      {/* Detalle de exámenes */}
      <Card className="shadow-none">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm font-semibold">
            Detalle de exámenes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {initialData.lineas.length === 0 ? (
            <div className="p-6">
              <EmptyState
                compact
                title="Sin exámenes"
                description="Este presupuesto todavía no tiene líneas cargadas."
                icon={<FileText className="h-5 w-5" />}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 w-10 py-1.5 text-right">#</TableHead>
                  <TableHead className="h-9 py-1.5">Examen</TableHead>
                  <TableHead className="h-9 w-24 py-1.5">Origen</TableHead>
                  <TableHead className="h-9 w-28 py-1.5 text-right">
                    Precio base
                  </TableHead>
                  <TableHead className="h-9 w-28 py-1.5 text-right">
                    Precio final
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialData.lineas.map((linea, index) => (
                  <TableRow key={linea.id} className="h-9">
                    <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="py-1.5 font-medium text-foreground">
                      {linea.nombre_snap}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {linea.paquete_id ? (
                        <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                          Paquete
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          Individual
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {formatUsd(linea.precio_base_snap ?? linea.precio_snap)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums text-foreground">
                      {formatUsd(linea.precio_final_snap ?? linea.precio_snap)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (converting) return;
          setConfirmOpen(open);
          if (!open) setPacienteAsignado(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {esNombreLibre ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Asigná una ficha antes de convertir
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Este presupuesto está a nombre libre de{" "}
                  <span className="font-medium text-foreground">
                    {initialData.paciente_nombre_libre}
                  </span>
                  . Elegí una ficha existente para vincularla y crear la orden.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-foreground">
                  Buscar paciente
                </label>
                <PacienteAutocomplete
                  onSelect={(p) => setPacienteAsignado(p)}
                  disabled={converting}
                />
                {pacienteAsignado ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/40">
                    <p className="font-medium text-emerald-900 dark:text-emerald-200">
                      {pacienteAsignado.nombre} {pacienteAsignado.apellido}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-emerald-700 dark:text-emerald-300">
                      {pacienteAsignado.cedula}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    ¿No lo encontrás?{" "}
                    <Link
                      href="/pacientes"
                      className="text-primary underline underline-offset-2"
                    >
                      Crear ficha nueva
                    </Link>{" "}
                    y volvé después.
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setConfirmOpen(false);
                    setPacienteAsignado(null);
                  }}
                  disabled={converting}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={!pacienteAsignado || converting}
                  onClick={() => void convertir(pacienteAsignado?.id)}
                >
                  <UserRound className="h-3.5 w-3.5" />
                  {converting ? "Convirtiendo…" : "Vincular y convertir"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  Convertir en orden de laboratorio
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Se creará una orden en estado <strong>Registrada</strong> con los
                  exámenes de este presupuesto. El presupuesto pasará a{" "}
                  <strong>Cerrado</strong>.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => setConfirmOpen(false)}
                  disabled={converting}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={() => void convertir()}
                  disabled={converting}
                >
                  {converting ? "Convirtiendo…" : "Confirmar conversión"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaCell({
  label,
  mono = false,
  strong = false,
  children,
}: {
  label: string;
  mono?: boolean;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={[
          mono ? "font-mono tabular-nums" : "",
          strong ? "text-sm font-semibold text-foreground" : "text-xs text-foreground",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </dd>
    </div>
  );
}
