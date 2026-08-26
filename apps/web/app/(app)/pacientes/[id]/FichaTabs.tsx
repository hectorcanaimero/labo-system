"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, NotebookTabs, PencilLine, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@labo/ui/feedback";
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

type TabKey = "resultados" | "presupuestos";

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

export function FichaTabs({ data }: FichaTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("resultados");
  const [isEditOpen, setIsEditOpen] = useState(false);

  const ficha = useMemo(() => {
    const edadInfo = calcularEdadDesglosada(new Date(data.paciente.fecha_nacimiento));
    const edadContent = edadInfo ? (
      <div className="flex flex-col gap-1 items-start">
        <span>{edadInfo.textoFormateado}</span>
        {edadInfo.anos < 18 && (
          <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            {edadInfo.etapa.toUpperCase()}
          </span>
        )}
      </div>
    ) : (
      `${data.paciente.edad} años`
    );

    return [
      { label: "Cédula", value: data.paciente.cedula },
      { label: "Edad", value: edadContent },
      { label: "Nacimiento", value: formatDate(data.paciente.fecha_nacimiento) },
      { label: "Sexo", value: data.paciente.sexo ?? "No especificado" },
      { label: "Teléfono", value: data.paciente.telefono ?? "—" },
      { label: "Correo", value: data.paciente.email ?? "—" },
      { label: "Dirección", value: data.paciente.direccion ?? "—" },
    ];
  }, [data.paciente]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2 lg:flex-1 lg:grid-cols-3">
            {ficha.map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-background/60 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 justify-end">
            <Button type="button" onClick={() => setIsEditOpen(true)}>
              <PencilLine className="h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-border p-4">
          <Button
            type="button"
            variant={activeTab === "resultados" ? "default" : "outline"}
            onClick={() => setActiveTab("resultados")}
          >
            <NotebookTabs className="h-4 w-4" />
            Resultados ({data.resultados.length})
          </Button>
          <Button
            type="button"
            variant={activeTab === "presupuestos" ? "default" : "outline"}
            onClick={() => setActiveTab("presupuestos")}
          >
            <ReceiptText className="h-4 w-4" />
            Presupuestos ({data.presupuestos.length})
          </Button>
        </div>

        <div className="p-4">
          {activeTab === "resultados" ? (
            data.resultados.length === 0 ? (
              <EmptyState
                compact
                title="Sin resultados"
                description="Todavía no hay resultados asociados a este paciente."
                icon={<FileText className="h-5 w-5" />}
              />
            ) : (
              <div className="space-y-4">
                {data.resultados.map((resultado) => (
                  <article key={resultado.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground">Resultado #{resultado.id.slice(0, 8)}</h3>
                        <p className="text-sm text-muted-foreground">
                          Muestra: {formatDate(resultado.fecha_muestra)} · Entrega: {formatDate(resultado.fecha_resultado)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Estado: <span className="font-medium text-foreground">{resultado.estado}</span>
                        </p>
                        {resultado.medico_solicitante ? (
                          <p className="text-sm text-muted-foreground">
                            Médico solicitante: {resultado.medico_solicitante}
                          </p>
                        ) : null}
                      </div>

                      <Link href={`/resultados/${resultado.id}`} className="text-sm font-medium text-primary hover:underline">
                        Ver resultado
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {resultado.examenes.map((examen) => (
                        <div key={examen.id} className="rounded-md border border-border bg-muted/20 p-3">
                          <p className="font-medium text-foreground">{examen.nombre_snap}</p>
                          <p className="text-sm text-muted-foreground">
                            Valor: {examen.valor}
                            {examen.unidad_snap ? ` ${examen.unidad_snap}` : ""}
                          </p>
                          {examen.valores_referencia_snap ? (
                            <p className="text-xs text-muted-foreground">
                              Referencia: {examen.valores_referencia_snap}
                            </p>
                          ) : null}
                          {examen.observacion ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Observación: {examen.observacion}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {resultado.observaciones ? (
                      <p className="mt-4 text-sm text-muted-foreground">
                        Observaciones: {resultado.observaciones}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )
          ) : data.presupuestos.length === 0 ? (
            <EmptyState
              compact
              title="Sin presupuestos"
              description="Este paciente todavía no tiene presupuestos cargados."
              icon={<ReceiptText className="h-5 w-5" />}
            />
          ) : (
            <div className="space-y-4">
              {data.presupuestos.map((presupuesto) => (
                <article key={presupuesto.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">Presupuesto #{presupuesto.id.slice(0, 8)}</h3>
                      <p className="text-sm text-muted-foreground">
                        Creado: {formatDate(presupuesto.created_at)} · Estado: <span className="font-medium text-foreground">{presupuesto.estado}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Total USD: {formatCurrency(presupuesto.total_usd, "USD")} · Total Bs: {formatCurrency(presupuesto.total_bs, "VES")}
                      </p>
                    </div>

                    <Link href={`/presupuestos/${presupuesto.id}`} className="text-sm font-medium text-primary hover:underline">
                      Ver presupuesto
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {presupuesto.lineas.map((linea) => (
                      <div key={linea.id} className="rounded-md border border-border bg-muted/20 p-3">
                        <p className="font-medium text-foreground">{linea.nombre_snap}</p>
                        <p className="text-sm text-muted-foreground">
                          Precio: {formatCurrency(linea.precio_snap, "USD")}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

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
