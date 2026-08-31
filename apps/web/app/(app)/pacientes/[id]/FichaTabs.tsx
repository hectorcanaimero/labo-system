"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileText,
  NotebookTabs,
  PencilLine,
  ReceiptText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@labo/ui/feedback";
import { OrdenEstadoBadge } from "@labo/ui/ordenes/OrdenEstadoBadge";
import { PresupuestoEstadoBadge } from "@labo/ui/presupuestos/PresupuestoEstadoBadge";
import type { EstadoOrden } from "@labo/lib/schemas/orden";
import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";
import { calcularEdadDesglosada } from "@labo/lib/edad";

import {
  PacienteFormDialog,
  type PacienteSerializable,
} from "../PacienteFormDialog";

interface ResultadoLinea {
  id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: number;
  unidad_snap: string | null;
  valores_referencia_snap: string | null;
  valor: string;
  observacion: string | null;
  orden: number;
}

interface ResultadoHistorialItem {
  id: string;
  paciente_id: string;
  fecha_muestra: string;
  fecha_resultado: string | null;
  medico_solicitante: string | null;
  estado: string;
  observaciones: string | null;
  origen_presupuesto_id: string | null;
  created_at: string;
  created_by: string;
  examenes: ResultadoLinea[];
}

interface PresupuestoLinea {
  id: string;
  presupuesto_id: string;
  examen_id: string;
  nombre_snap: string;
  precio_snap: number;
  orden: number;
}

interface PresupuestoHistorialItem {
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
  estado: string;
  resultado_id: string | null;
  created_at: string;
  created_by: string;
  lineas: PresupuestoLinea[];
}

export interface PacienteFichaData {
  paciente: PacienteSerializable & { edad: number };
  resultados: ResultadoHistorialItem[];
  presupuestos: PresupuestoHistorialItem[];
}

interface FichaTabsProps {
  data: PacienteFichaData;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatCurrency(value: number, currency: "USD" | "VES"): string {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function sexoLabel(sexo: "M" | "F" | "O" | null): string {
  if (sexo === "M") return "Masculino";
  if (sexo === "F") return "Femenino";
  if (sexo === "O") return "Otro";
  return "No especificado";
}

export function FichaTabs({ data }: FichaTabsProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const meta = useMemo(() => {
    const edadInfo = calcularEdadDesglosada(new Date(data.paciente.fecha_nacimiento));
    return {
      edad: edadInfo,
      cedula: data.paciente.cedula,
      nacimiento: formatDate(data.paciente.fecha_nacimiento),
      sexo: sexoLabel(data.paciente.sexo),
      telefono: data.paciente.telefono,
      email: data.paciente.email,
      direccion: data.paciente.direccion,
    };
  }, [data.paciente]);

  return (
    <div className="flex flex-col gap-4">
      {/* Metadata card */}
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-border py-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-sm font-semibold">Ficha clínica</CardTitle>
            {meta.edad ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{meta.edad.textoFormateado}</span>
                {meta.edad.anos < 18 ? (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    {meta.edad.etapa}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setIsEditOpen(true)}
          >
            <PencilLine className="h-3.5 w-3.5" />
            Editar
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <MetaRow label="Cédula" value={meta.cedula} mono />
            <MetaRow label="Nacimiento" value={meta.nacimiento} mono />
            <MetaRow label="Sexo" value={meta.sexo} />
            <MetaRow label="Teléfono" value={meta.telefono ?? "—"} mono />
            <MetaRow label="Correo" value={meta.email ?? "—"} />
            <MetaRow label="Dirección" value={meta.direccion ?? "—"} />
          </dl>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="resultados" className="flex flex-col gap-3">
        <TabsList className="w-fit">
          <TabsTrigger value="resultados" className="gap-1.5">
            <NotebookTabs className="h-3.5 w-3.5" />
            Órdenes
            <span className="ml-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {data.resultados.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="presupuestos" className="gap-1.5">
            <ReceiptText className="h-3.5 w-3.5" />
            Presupuestos
            <span className="ml-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {data.presupuestos.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resultados" className="mt-0">
          {data.resultados.length === 0 ? (
            <Card className="shadow-none">
              <CardContent className="p-6">
                <EmptyState
                  compact
                  title="Sin órdenes"
                  description="Todavía no hay órdenes asociadas a este paciente."
                  icon={<FileText className="h-5 w-5" />}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {data.resultados.map((resultado) => (
                <Card key={resultado.id} className="shadow-none">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-border py-2.5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <OrdenEstadoBadge estado={resultado.estado as EstadoOrden} />
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          #{resultado.id.slice(0, 8)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Muestra{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatDate(resultado.fecha_muestra)}
                        </span>
                        {" · "}
                        Entrega{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatDate(resultado.fecha_resultado)}
                        </span>
                        {resultado.medico_solicitante ? (
                          <>
                            {" · "}
                            <span className="italic">{resultado.medico_solicitante}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Link
                      href={`/resultados/${resultado.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Abrir <ArrowRight className="h-3 w-3" />
                    </Link>
                  </CardHeader>
                  <CardContent className="p-3">
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {resultado.examenes.map((examen) => (
                        <li
                          key={examen.id}
                          className="flex items-baseline justify-between gap-2 rounded border border-border bg-muted/20 px-2.5 py-1.5"
                        >
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {examen.nombre_snap}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {examen.valor || "—"}
                            {examen.unidad_snap ? (
                              <span className="ml-1 text-[10px]">{examen.unidad_snap}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {resultado.observaciones ? (
                      <p className="mt-2 border-t border-border pt-2 text-xs italic text-muted-foreground">
                        {resultado.observaciones}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="presupuestos" className="mt-0">
          {data.presupuestos.length === 0 ? (
            <Card className="shadow-none">
              <CardContent className="p-6">
                <EmptyState
                  compact
                  title="Sin presupuestos"
                  description="Este paciente todavía no tiene presupuestos cargados."
                  icon={<ReceiptText className="h-5 w-5" />}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {data.presupuestos.map((presupuesto) => (
                <Card key={presupuesto.id} className="shadow-none">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-border py-2.5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <PresupuestoEstadoBadge
                          estado={presupuesto.estado as EstadoPresupuesto}
                        />
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          #{presupuesto.id.slice(0, 8)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Creado{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatDate(presupuesto.created_at)}
                        </span>
                        {" · "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatCurrency(presupuesto.total_usd, "USD")}
                        </span>
                        {" / "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatCurrency(presupuesto.total_bs, "VES")}
                        </span>
                      </p>
                    </div>
                    <Link
                      href={`/presupuestos/${presupuesto.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Abrir <ArrowRight className="h-3 w-3" />
                    </Link>
                  </CardHeader>
                  <CardContent className="p-3">
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {presupuesto.lineas.map((linea) => (
                        <li
                          key={linea.id}
                          className="flex items-baseline justify-between gap-2 rounded border border-border bg-muted/20 px-2.5 py-1.5"
                        >
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {linea.nombre_snap}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {formatCurrency(linea.precio_snap, "USD")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PacienteFormDialog
        paciente={data.paciente}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={async () => {
          setIsEditOpen(false);
          router.refresh();
        }}
        onDeleted={async () => {
          setIsEditOpen(false);
          router.push("/pacientes");
          router.refresh();
        }}
      />
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd
        className={`min-w-0 truncate text-foreground ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
