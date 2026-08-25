"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  FileText,
  Calendar,
  Filter,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { toHumanError } from "@labo/lib/error-messages";
import { EmptyState, SkeletonTable } from "@labo/ui/feedback";
import { ExportButton } from "@labo/ui/exports/ExportButton";

export interface PaginatedPresupuestosResponse {
  items: any[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PresupuestosListProps {
  initialData: PaginatedPresupuestosResponse;
  pageSize: number;
}

const SEARCH_DEBOUNCE_MS = 300;

function formatDate(value: string): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("es-VE", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatCurrency(value: string | number, symbol = "$"): string {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return "";
  return `${symbol} ${num.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PresupuestosList({ initialData, pageSize }: PresupuestosListProps) {
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState(initialData.page);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const fetchFilters = useMemo(() => {
    return {
      term: debouncedSearchTerm || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      estado: estado || undefined,
    };
  }, [debouncedSearchTerm, desde, hasta, estado]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage(): Promise<void> {
      try {
        setLoadingList(true);
        setErrorMessage(null);

        const params = new URLSearchParams();
        params.append("page", String(page));
        params.append("limit", String(pageSize));
        if (debouncedSearchTerm) params.append("term", debouncedSearchTerm);
        if (desde) params.append("desde", desde);
        if (hasta) params.append("hasta", hasta);
        if (estado) params.append("estado", estado);

        const response = await fetch(`/api/presupuestos?${params.toString()}`, {
          headers: { accept: "application/json" },
        });

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (response.status === 403) {
          window.location.href = "/dashboard?reason=sin-permisos";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || `REQUEST_FAILED_${response.status}`);
        }

        const payload = (await response.json()) as PaginatedPresupuestosResponse;
        if (cancelled) return;
        setData(payload);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(toHumanError(error));
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, fetchFilters]);

  // Reset page to 1 when filters change to avoid empty pages.
  useEffect(() => {
    setPage(1);
  }, [fetchFilters]);

  const visibleItems = data.items || [];
  const showEmptyState = !loadingList && visibleItems.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Filter bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground/70" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por paciente o código"
              className="flex h-11 w-full rounded-md border border-input bg-background py-2 pl-9 pr-10 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ExportButton actionName="presupuestos" filters={{ desde, hasta, estado }} />
            <Link href="/presupuestos/nuevo">
              <Button type="button" className="shrink-0 h-11">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo presupuesto
              </Button>
            </Link>
          </div>
        </div>

        {/* Detailed filters */}
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/50" />
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/50" />
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Estado</label>
            <div className="relative">
              <Filter className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/50" />
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring appearance-none"
              >
                <option value="">Todos los estados</option>
                <option value="Borrador">Borrador</option>
                <option value="Aprobado">Aprobado</option>
                <option value="Convertido">Convertido</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {/* Main List Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        {loadingList ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={6} />
          </div>
        ) : showEmptyState ? (
          <div className="p-6">
            <EmptyState
              title="No encontramos presupuestos"
              description="Ajustá los filtros o creá un nuevo presupuesto para arrancar."
              icon={<FileText className="h-6 w-6" />}
              action={
                <Link href="/presupuestos/nuevo">
                  <Button type="button">
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo presupuesto
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Paciente</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Total USD</th>
                    <th className="px-4 py-3 font-medium">Total Bs</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleItems.map((presupuesto: any) => {
                    const pacienteName = presupuesto.paciente_id
                      ? `${presupuesto.paciente_nombre || ""} ${presupuesto.paciente_apellido || ""}`.trim()
                      : presupuesto.paciente_nombre_libre || "Nombre no registrado";

                    return (
                      <tr key={presupuesto.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <Link
                            href={`/presupuestos/${presupuesto.id}`}
                            className="hover:underline"
                          >
                            {pacienteName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(presupuesto.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              presupuesto.estado === "Borrador"
                                ? "bg-amber-100 text-amber-800"
                                : presupuesto.estado === "Aprobado"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {presupuesto.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono">
                          {formatCurrency(presupuesto.total_usd, "$")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono">
                          {formatCurrency(presupuesto.total_bs, "Bs")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/presupuestos/${presupuesto.id}`}>
                            <Button type="button" variant="outline" size="sm">
                              Ver Detalle
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando página <span className="font-medium text-foreground">{data.page}</span> de{" "}
                <span className="font-medium text-foreground">{data.totalPages}</span> ·{" "}
                <span className="font-medium text-foreground">{data.total}</span> presupuestos
              </p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loadingList}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={data.totalPages === 0 || page >= data.totalPages || loadingList}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
