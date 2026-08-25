"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardList, FileText, Plus } from "lucide-react";
import { EmptyState } from "@labo/ui/feedback";
import { toHumanError } from "@labo/lib/error-messages";
import { Button } from "@/components/ui/button";

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
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(value instanceof Date ? value : new Date(value));
  } catch {
    return "—";
  }
}

function formatCurrency(value: number): string {
  return `$ ${value.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getPacienteNombre(p: PresupuestoActivity): string {
  if (p.paciente_nombre_libre) return p.paciente_nombre_libre;
  const nombre = `${p.paciente_nombre ?? ""} ${p.paciente_apellido ?? ""}`.trim();
  return nombre || "Paciente sin nombre";
}

const ESTADO_BADGE: Record<string, string> = {
  Pendiente: "bg-amber-100 text-amber-800",
  Completado: "bg-emerald-100 text-emerald-800",
  Borrador: "bg-muted text-muted-foreground",
  Aprobado: "bg-blue-100 text-blue-800",
  Convertido: "bg-emerald-100 text-emerald-800",
};

export function RecentActivity({ initialActivity }: RecentActivityProps) {
  const [activity, setActivity] = useState(initialActivity);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch("/api/dashboard?limit=5", {
          headers: { accept: "application/json" },
        });
        if (res.status === 401) { window.location.href = "/login"; return; }
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

    const timer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const noData =
    activity.resultados.length === 0 && activity.presupuestos.length === 0;

  if (noData) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <EmptyState
          title="Empezá creando tu primer paciente"
          description="Registrá un paciente para comenzar a gestionar resultados y presupuestos."
          icon={<ClipboardList className="h-6 w-6" />}
          action={
            <Link href="/pacientes">
              <Button type="button">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo paciente
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Últimos resultados */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Últimos resultados</h2>
          </div>
          {activity.resultados.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No hay resultados registrados todavía.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.resultados.map((r) => {
                const nombre = `${r.paciente_nombre} ${r.paciente_apellido}`.trim();
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/resultados/${r.id}`}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {nombre}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(r.fecha_muestra)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${ESTADO_BADGE[r.estado] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {r.estado}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-border px-5 py-3">
            <Link href="/resultados" className="text-xs font-medium text-primary hover:underline">
              Ver todos los resultados →
            </Link>
          </div>
        </div>

        {/* Últimos presupuestos */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Últimos presupuestos</h2>
          </div>
          {activity.presupuestos.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No hay presupuestos registrados todavía.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.presupuestos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/presupuestos/${p.id}`}
                      className="truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {getPacienteNombre(p)}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatCurrency(p.total_usd)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${ESTADO_BADGE[p.estado] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {p.estado}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-5 py-3">
            <Link href="/presupuestos" className="text-xs font-medium text-primary hover:underline">
              Ver todos los presupuestos →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
