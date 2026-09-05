"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardList, FileText, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OrdenEstadoBadge } from "@labo/ui/ordenes/OrdenEstadoBadge";
import { PresupuestoEstadoBadge } from "@labo/ui/presupuestos/PresupuestoEstadoBadge";
import type { EstadoOrden } from "@labo/lib/schemas/orden";
import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";
import { EmptyState } from "@labo/ui/feedback";
import { toHumanError } from "@labo/lib/error-messages";

import { apiFetch } from "@/lib/api-client";
interface ResultadoActivity {
  id: string;
  paciente_id: string;
  paciente_nombre: string;
  paciente_apellido: string;
  fecha_muestra: string;
  estado: string;
  created_at: string;
}

interface PresupuestoActivity {
  id: string;
  paciente_id: string | null;
  paciente_nombre: string | null;
  paciente_apellido: string | null;
  paciente_nombre_libre: string | null;
  estado: string;
  total_usd: number;
  created_at: string;
}

export interface RecentActivityData {
  resultados: ResultadoActivity[];
  presupuestos: PresupuestoActivity[];
}

interface RecentActivityProps {
  initialActivity: RecentActivityData;
}

const POLL_INTERVAL_MS = 30_000;

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-VE", {
      dateStyle: "short",
      timeZone: "UTC",
    }).format(value instanceof Date ? value : new Date(value));
  } catch {
    return "—";
  }
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getPacienteNombre(p: PresupuestoActivity): string {
  if (p.paciente_nombre_libre) return p.paciente_nombre_libre;
  const nombre = `${p.paciente_nombre ?? ""} ${p.paciente_apellido ?? ""}`.trim();
  return nombre || "Sin nombre";
}

export function RecentActivity({ initialActivity }: RecentActivityProps) {
  const [activity, setActivity] = useState(initialActivity);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await apiFetch("/api/dashboard?limit=5", {
          headers: { accept: "application/json" },
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error ?? `REQUEST_FAILED_${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) setActivity(json.activity as RecentActivityData);
      } catch (err) {
        if (!cancelled) setError(toHumanError(err));
      }
    }

    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const noData =
    activity.resultados.length === 0 && activity.presupuestos.length === 0;

  if (noData) {
    return (
      <Card className="shadow-none">
        <CardContent className="p-6">
          <EmptyState
            title="Empezá creando tu primer paciente"
            description="Registrá un paciente para comenzar a gestionar órdenes y presupuestos."
            icon={<ClipboardList className="h-6 w-6" />}
            action={
              <Link href="/pacientes">
                <Button type="button" size="sm">
                  <Plus className="h-4 w-4" />
                  Nuevo paciente
                </Button>
              </Link>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Últimas órdenes */}
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border py-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Últimas órdenes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activity.resultados.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                No hay órdenes registradas todavía.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {activity.resultados.map((r) => {
                  const nombre =
                    `${r.paciente_nombre} ${r.paciente_apellido}`.trim();
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/resultados/${r.id}`}
                          className="block truncate text-sm font-medium text-foreground hover:underline"
                        >
                          {nombre}
                        </Link>
                        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatDate(r.fecha_muestra)}
                        </p>
                      </div>
                      <OrdenEstadoBadge estado={r.estado as EstadoOrden} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
          <CardFooter className="border-t border-border py-2">
            <Link
              href="/resultados"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>

        {/* Últimos presupuestos */}
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border py-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Últimos presupuestos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activity.presupuestos.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                No hay presupuestos registrados todavía.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {activity.presupuestos.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/presupuestos/${p.id}`}
                        className="block truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {getPacienteNombre(p)}
                      </Link>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatCurrency(p.total_usd)}
                      </p>
                    </div>
                    <PresupuestoEstadoBadge estado={p.estado as EstadoPresupuesto} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="border-t border-border py-2">
            <Link
              href="/presupuestos"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
