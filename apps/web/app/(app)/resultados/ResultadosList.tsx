"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/layout/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toHumanError } from "@labo/lib/error-messages";
import { EmptyState, SkeletonTable } from "@labo/ui/feedback";
import { ExportButton } from "@labo/ui/exports/ExportButton";
import { OrdenEstadoBadge } from "@labo/ui/ordenes/OrdenEstadoBadge";
import { ESTADO_ORDEN, type EstadoOrden } from "@labo/lib/schemas/orden";

export interface ResultadoListItem {
  id: string;
  paciente_id: string;
  paciente_nombre: string;
  paciente_apellido: string;
  paciente_cedula: string;
  fecha_muestra: string;
  fecha_resultado: string | null;
  medico_solicitante: string | null;
  estado: "Registrada" | "Muestra tomada" | "En proceso" | "Validando" | "Entregada" | "Anulada";
  observaciones: string | null;
  origen_presupuesto_id: string | null;
  created_at: string;
  created_by: string;
  examenes_count: number;
}

export interface PaginatedResultadosResponse {
  items: ResultadoListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ResultadosListProps {
  initialData: PaginatedResultadosResponse;
  pageSize: number;
}

const SEARCH_DEBOUNCE_MS = 250;

function formatDate(value: string | null): string {
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

export function ResultadosList({ initialData, pageSize }: ResultadosListProps) {
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

  const fetchFilters = useMemo(
    () => ({
      term: debouncedSearchTerm || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      estado: estado || undefined,
    }),
    [debouncedSearchTerm, desde, hasta, estado],
  );

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

        const response = await fetch(`/api/resultados?${params.toString()}`, {
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

        const payload = (await response.json()) as PaginatedResultadosResponse;
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
  }, [page, pageSize, fetchFilters, debouncedSearchTerm, desde, hasta, estado]);

  useEffect(() => {
    setPage(1);
  }, [fetchFilters]);

  const visibleItems = data.items || [];
  const showEmptyState = !loadingList && visibleItems.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar densa — todo en una fila */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por paciente, cédula o fecha…"
            className="flex h-8 w-full rounded-md border border-input bg-background py-1 pl-8 pr-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>

        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          aria-label="Desde"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          aria-label="Hasta"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Estado"
          className="h-8 appearance-none rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Todos los estados</option>
          {ESTADO_ORDEN.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <ExportButton actionName="resultados" filters={{ desde, hasta, estado }} />
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        {loadingList ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={6} />
          </div>
        ) : showEmptyState ? (
          <div className="p-6">
            <EmptyState
              title="No encontramos órdenes"
              description="Ajustá los filtros o cargá una nueva orden para comenzar."
              icon={<FileText className="h-6 w-6" />}
              action={
                <Link href="/resultados/nuevo">
                  <Button type="button" size="sm">
                    <Plus className="h-4 w-4" />
                    Nueva orden
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 py-1.5">Paciente</TableHead>
                  <TableHead className="h-9 py-1.5">Cédula</TableHead>
                  <TableHead className="h-9 py-1.5">F. muestra</TableHead>
                  <TableHead className="h-9 py-1.5">F. entrega</TableHead>
                  <TableHead className="h-9 py-1.5">Estado</TableHead>
                  <TableHead className="h-9 w-16 py-1.5 text-right">Exámenes</TableHead>
                  <TableHead className="h-9 w-24 py-1.5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((resultado) => {
                  const pacienteName = `${resultado.paciente_nombre || ""} ${resultado.paciente_apellido || ""}`.trim();
                  return (
                    <TableRow key={resultado.id} className="h-9">
                      <TableCell className="py-1.5 font-medium text-foreground">
                        <Link
                          href={`/resultados/${resultado.id}`}
                          className="hover:underline"
                        >
                          {pacienteName}
                        </Link>
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {resultado.paciente_cedula}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDate(resultado.fecha_muestra)}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDate(resultado.fecha_resultado)}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <OrdenEstadoBadge estado={resultado.estado as EstadoOrden} />
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {resultado.examenes_count}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <Link href={`/resultados/${resultado.id}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                          >
                            Detalle
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              label="órdenes"
              disabled={loadingList}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
