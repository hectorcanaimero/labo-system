"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Filter,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonTable } from "@labo/ui/feedback";

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

const inputClasses =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

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
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClasses}
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Auditoría</h1>
        <p className="text-muted-foreground text-sm">
          Historial de eventos del sistema. Sólo lectura — registros de
          auditoría.
        </p>
      </div>

      {/* Filtros */}
      <section
        aria-label="Filtros"
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4" />
          Filtros
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            placeholder="ej. auth.login"
          />
          <FilterInput
            label="Entidad"
            value={draft.entity}
            onChange={(entity) => setDraft((prev) => ({ ...prev, entity }))}
            placeholder="ej. presupuestos"
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
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={applyFilters} disabled={loading}>
            <Search className="h-4 w-4" />
            Buscar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clearFilters}
            disabled={loading}
          >
            <X className="h-4 w-4" />
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
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                  <th className="px-4 py-3 font-medium">Entidad</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((event) => (
                  <tr key={event.id} className="align-top hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {event.usuarioNombre ? (
                        <div>
                          <div className="font-medium">{event.usuarioNombre}</div>
                          <div className="text-xs text-muted-foreground">
                            {event.usuarioEmail}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {event.accion}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{event.entityType}</div>
                      {event.entityId ? (
                        <div className="text-xs text-muted-foreground">
                          {event.entityId}
                        </div>
                      ) : null}
                    </td>
                    <td
                      className="max-w-xs px-4 py-3 text-xs text-muted-foreground"
                      title={event.metadata ? JSON.stringify(event.metadata) : undefined}
                    >
                      {renderMetadata(event.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {data.total} evento{data.total === 1 ? "" : "s"} · página {data.page}{" "}
              de {data.totalPages || 1}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
