"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList,
  Filter,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, SkeletonTable } from "@labo/ui/feedback";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";

interface AuditEvent {
  id: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  usuarioEmail: string | null;
  accion: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditListResponse {
  items: AuditEvent[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Filters {
  usuario: string;
  accion: string;
  entity: string;
  desde: string;
  hasta: string;
}

const PAGE_SIZE = 25;
const EMPTY_FILTERS: Filters = {
  usuario: "",
  accion: "",
  entity: "",
  desde: "",
  hasta: "",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function renderMetadata(metadata: Record<string, unknown> | null): string {
  if (metadata === null) return "—";
  const json = JSON.stringify(metadata);
  return json.length > 120 ? `${json.slice(0, 120)}…` : json;
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 text-xs"
      />
    </label>
  );
}

export default function AuditPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (applied.usuario.trim()) params.set("usuario", applied.usuario.trim());
      if (applied.accion.trim()) params.set("accion", applied.accion.trim());
      if (applied.entity.trim()) params.set("entity", applied.entity.trim());
      if (applied.desde) params.set("desde", applied.desde);
      if (applied.hasta) params.set("hasta", `${applied.hasta}T23:59:59`);

      const res = await fetch(`/api/audit?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        // Middleware ya redirige a Operador; por si la sesión venció a mitad
        // de navegación, volvemos al login/dashboard.
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error("No se pudo cargar el audit log.");
      const json = (await res.json()) as AuditListResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }, [page, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setApplied(draft);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const hasActiveFilters = Object.values(applied).some(
    (value) => value.trim().length > 0,
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader
        title="Auditoría"
        count={data ? data.total : undefined}
        description="Historial de eventos del sistema — solo lectura."
      />

      {/* Filtros densos */}
      <section
        aria-label="Filtros"
        className="rounded-md border border-border bg-muted/20 p-2"
      >
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Filter className="h-3 w-3" />
          Filtros
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <FilterInput
            label="Usuario"
            value={draft.usuario}
            onChange={(usuario) => setDraft((prev) => ({ ...prev, usuario }))}
            placeholder="Nombre o email"
          />
          <FilterInput
            label="Acción"
            value={draft.accion}
            onChange={(accion) => setDraft((prev) => ({ ...prev, accion }))}
            placeholder="auth.login"
          />
          <FilterInput
            label="Entidad"
            value={draft.entity}
            onChange={(entity) => setDraft((prev) => ({ ...prev, entity }))}
            placeholder="presupuestos"
          />
          <FilterInput
            label="Desde"
            value={draft.desde}
            onChange={(desde) => setDraft((prev) => ({ ...prev, desde }))}
            type="date"
          />
          <FilterInput
            label="Hasta"
            value={draft.hasta}
            onChange={(hasta) => setDraft((prev) => ({ ...prev, hasta }))}
            type="date"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8"
            onClick={applyFilters}
            disabled={loading}
          >
            <Search className="h-3.5 w-3.5" />
            Buscar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={clearFilters}
            disabled={loading}
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        </div>
      </section>

      {/* Tabla */}
      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : error ? (
        <EmptyState
          title="No se pudo cargar la auditoría"
          description={error}
          icon={<ClipboardList className="h-8 w-8" />}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "Sin resultados" : "Sin eventos todavía"}
          description={
            hasActiveFilters
              ? "No hay eventos que matcheen los filtros aplicados."
              : "Los eventos de login, configuración y negocios van a aparecer acá."
          }
          icon={<ClipboardList className="h-8 w-8" />}
        />
      ) : data ? (
        <Card className="shadow-none">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 w-44 py-1.5">Fecha</TableHead>
                  <TableHead className="h-9 py-1.5">Usuario</TableHead>
                  <TableHead className="h-9 py-1.5">Acción</TableHead>
                  <TableHead className="h-9 py-1.5">Entidad</TableHead>
                  <TableHead className="h-9 py-1.5">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((event) => (
                  <TableRow key={event.id} className="align-top">
                    <TableCell className="whitespace-nowrap py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {event.usuarioNombre ? (
                        <div>
                          <div className="text-xs font-medium text-foreground">
                            {event.usuarioNombre}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {event.usuarioEmail}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {event.accion}
                      </code>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="text-xs font-medium text-foreground">
                        {event.entityType}
                      </div>
                      {event.entityId ? (
                        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {event.entityId}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className="max-w-xs py-1.5 text-[11px] text-muted-foreground"
                      title={
                        event.metadata ? JSON.stringify(event.metadata) : undefined
                      }
                    >
                      {renderMetadata(event.metadata)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              label={data.total === 1 ? "evento" : "eventos"}
              disabled={loading}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
