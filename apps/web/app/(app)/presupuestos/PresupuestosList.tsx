"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  Plus,
  Search,
  FileText,
  Calendar,
  Filter,
  MoreVertical,
  X,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ESTADO_PRESUPUESTO, type EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";
import { toHumanError } from "@labo/lib/error-messages";
import { EmptyState, SkeletonTable } from "@labo/ui/feedback";
import { ExportButton } from "@labo/ui/exports/ExportButton";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";
import {
  esTransicionValida,
  PresupuestoEstadoBadge,
  PresupuestoKanbanCard,
  PresupuestoPipelineKanban,
  TRANSICIONES_ESTADO_UI,
  type PipelinePresupuestoCard,
} from "@labo/ui/presupuestos";

export interface PresupuestoListItem {
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
  estado: EstadoPresupuesto;
  resultado_id: string | null;
  created_at: string;
  lineas: unknown[];
}

export interface PaginatedPresupuestosResponse {
  items: PresupuestoListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PresupuestosListProps {
  initialData: PaginatedPresupuestosResponse;
  pageSize: number;
}

type VistaPipeline = "tabla" | "kanban";

type AccionesModalState =
  | { mode: "acciones"; card: PipelinePresupuestoCard }
  | { mode: "motivo"; card: PipelinePresupuestoCard }
  | { mode: "convertir"; card: PipelinePresupuestoCard };

const SEARCH_DEBOUNCE_MS = 300;
const VIEW_STORAGE_KEY = "presupuestos.vista";
const COLUMN_ID_PREFIX = "col:";
const DRAG_ACTIVATION_DISTANCE = 6;

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

function pacienteNombre(
  presupuesto: Pick<
    PresupuestoListItem,
    "paciente_id" | "paciente_nombre" | "paciente_apellido" | "paciente_nombre_libre"
  >,
): string {
  if (presupuesto.paciente_id) {
    return `${presupuesto.paciente_nombre || ""} ${presupuesto.paciente_apellido || ""}`.trim();
  }
  return presupuesto.paciente_nombre_libre || "Nombre no registrado";
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

interface KanbanDropZoneProps {
  estado: EstadoPresupuesto;
  habilitado: boolean;
  atenuada: boolean;
  children: ReactNode;
}

function KanbanDropZone({ estado, habilitado, atenuada, children }: KanbanDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_ID_PREFIX}${estado}`,
    disabled: !habilitado,
  });

  return (
    <div
      ref={setNodeRef}
      data-estado={estado}
      className={`min-h-[5rem] rounded-lg p-1 transition-all ${
        isOver && habilitado ? "bg-primary/10 ring-2 ring-inset ring-primary/40" : ""
      } ${atenuada && !habilitado ? "opacity-50" : ""}`}
    >
      {children}
    </div>
  );
}

interface KanbanDraggableCardProps {
  card: PipelinePresupuestoCard;
  disabled: boolean;
  onAbrirAcciones: (card: PipelinePresupuestoCard) => void;
}

function KanbanDraggableCard({ card, disabled, onAbrirAcciones }: KanbanDraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onAbrirAcciones(card)}
      role="button"
      aria-roledescription="Tarjeta arrastrable"
      aria-label={`Presupuesto de ${card.pacienteLabel}. Abrí las acciones para cambiar su estado.`}
      className={`relative cursor-grab touch-none select-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <PresupuestoKanbanCard
        card={card}
        actionsSlot={
          <button
            type="button"
            aria-label={`Acciones rápidas para ${card.pacienteLabel}`}
            onClick={(event) => {
              event.stopPropagation();
              onAbrirAcciones(card);
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        }
      />
    </div>
  );
}

interface AccionesRapidasModalProps {
  state: AccionesModalState;
  pending: boolean;
  onClose: () => void;
  onConfirmarEstado: (
    card: PipelinePresupuestoCard,
    objetivo: EstadoPresupuesto,
    motivoRechazo: string,
  ) => void;
  onConfirmarConvertir: (card: PipelinePresupuestoCard) => void;
}

function AccionesRapidasModal({
  state,
  pending,
  onClose,
  onConfirmarEstado,
  onConfirmarConvertir,
}: AccionesRapidasModalProps) {
  const titleId = useId();
  const motivoId = `${titleId}-motivo`;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [modo, setModo] = useState<"acciones" | "motivo" | "convertir">(state.mode);
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const { card } = state;
  const destinos = TRANSICIONES_ESTADO_UI[card.estado];

  function confirmarRechazo(): void {
    const limpio = motivo.trim();
    if (limpio.length < 3) {
      setMotivoError("El motivo es obligatorio (mínimo 3 caracteres).");
      return;
    }
    onConfirmarEstado(card, "Rechazado", limpio);
  }

  const titulo =
    modo === "motivo"
      ? "Rechazar presupuesto"
      : modo === "convertir"
        ? "Convertir en resultado"
        : "Acciones rápidas";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pipeline</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar acciones rápidas"
            className="-mr-2 -mt-2 h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          {titulo}
        </h2>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {card.pacienteLabel}
          </span>
          <PresupuestoEstadoBadge estado={card.estado} />
        </div>

        {modo === "acciones" ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Cambiar el estado a:</p>
            {destinos.map((destino) => (
              <Button
                key={destino}
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (destino === "Rechazado") {
                    setModo("motivo");
                    return;
                  }
                  if (destino === "Convertido") {
                    setModo("convertir");
                    return;
                  }
                  onConfirmarEstado(card, destino, "");
                }}
              >
                <span>{destino === "Convertido" ? "Convertir en resultado clínico" : destino}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ))}
            {destinos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este presupuesto está en un estado final y no admite más cambios.
              </p>
            ) : null}
            <Link
              href={`/presupuestos/${card.id}`}
              className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
            >
              Ver detalle completo
            </Link>
          </div>
        ) : null}

        {modo === "motivo" ? (
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              confirmarRechazo();
            }}
          >
            <label htmlFor={motivoId} className="text-sm font-medium text-foreground">
              Motivo del rechazo <span className="text-destructive">*</span>
            </label>
            <textarea
              id={motivoId}
              autoFocus
              rows={3}
              required
              minLength={3}
              value={motivo}
              onChange={(event) => {
                setMotivo(event.target.value);
                if (motivoError) setMotivoError(null);
              }}
              placeholder="Contá brevemente por qué se rechaza…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {motivoError ? <p className="text-sm text-destructive">{motivoError}</p> : null}
            <div className="mt-1 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setModo("acciones");
                  setMotivo("");
                  setMotivoError(null);
                }}
              >
                Volver
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                Confirmar rechazo
              </Button>
            </div>
          </form>
        ) : null}

        {modo === "convertir" ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Se creará un resultado clínico en estado{" "}
              <strong className="text-foreground">Pendiente</strong> con los exámenes de este
              presupuesto y no podrá revertirse desde acá.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setModo("acciones");
                }}
              >
                Volver
              </Button>
              <Button type="button" disabled={pending} onClick={() => onConfirmarConvertir(card)}>
                Confirmar conversión
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PresupuestosList({ initialData, pageSize }: PresupuestosListProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState(initialData.page);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [vista, setVista] = useState<VistaPipeline>("tabla");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [acciones, setAcciones] = useState<AccionesModalState | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "tabla" || stored === "kanban") {
        setVista(stored);
      }
    } catch {
      return;
    }
  }, []);

  function cambiarVista(next: VistaPipeline): void {
    setVista(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      return;
    }
  }

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

  const pipelineCards = useMemo<PipelinePresupuestoCard[]>(
    () =>
      visibleItems.map((item) => ({
        id: item.id,
        estado: item.estado,
        pacienteLabel: pacienteNombre(item),
        fechaLabel: formatDate(item.created_at),
        totalUsd: Number(item.total_usd) || 0,
        totalBs: Number(item.total_bs) || 0,
      })),
    [visibleItems],
  );

  const activeCard = useMemo(
    () => (activeId ? pipelineCards.find((card) => card.id === activeId) ?? null : null),
    [activeId, pipelineCards],
  );

  const validTargets = useMemo(
    () =>
      new Set<EstadoPresupuesto>(
        activeCard ? TRANSICIONES_ESTADO_UI[activeCard.estado] : [],
      ),
    [activeCard],
  );

  async function applyEstadoChange(
    id: string,
    objetivo: EstadoPresupuesto,
    motivoRechazo?: string,
  ): Promise<void> {
    if (pendingId) return;
    const previous = data;
    const nextItems = previous.items.map((item) =>
      item.id === id ? { ...item, estado: objetivo } : item,
    );
    setData({ ...previous, items: nextItems });
    setPendingId(id);
    setAcciones(null);

    try {
      await requestJson(`/api/presupuestos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          estado: objetivo,
          ...(motivoRechazo ? { motivo_rechazo: motivoRechazo } : {}),
        }),
      });
      notifySuccess(`Presupuesto actualizado a ${objetivo}.`);
    } catch (error) {
      setData(previous);
      notifyError(error);
    } finally {
      setPendingId(null);
    }
  }

  async function convertirAResultado(card: PipelinePresupuestoCard): Promise<void> {
    if (pendingId) return;
    setPendingId(card.id);
    setAcciones(null);

    try {
      const result = await requestJson<{ resultado_id: string }>(
        `/api/presupuestos/${card.id}/convertir`,
        { method: "POST" },
      );
      notifySuccess("Presupuesto convertido en resultado clínico.");
      router.push(`/resultados/${result.resultado_id}`);
    } catch (error) {
      notifyError(error);
    } finally {
      setPendingId(null);
    }
  }

  function handleConfirmarEstado(
    card: PipelinePresupuestoCard,
    objetivo: EstadoPresupuesto,
    motivoRechazo: string,
  ): void {
    void applyEstadoChange(card.id, objetivo, motivoRechazo || undefined);
  }

  function handleConfirmarConvertir(card: PipelinePresupuestoCard): void {
    void convertirAResultado(card);
  }

  function handleDragStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveId(null);

    const overId = event.over?.id != null ? String(event.over.id) : null;
    if (!overId || !overId.startsWith(COLUMN_ID_PREFIX)) return;

    const card = pipelineCards.find((item) => item.id === String(event.active.id));
    if (!card) return;

    const objetivo = overId.slice(COLUMN_ID_PREFIX.length) as EstadoPresupuesto;
    if (objetivo === card.estado) return;

    if (!esTransicionValida(card.estado, objetivo)) {
      notifyError(new Error(`No se puede pasar de ${card.estado} a ${objetivo}.`));
      return;
    }
    if (objetivo === "Rechazado") {
      setAcciones({ mode: "motivo", card });
      return;
    }
    if (objetivo === "Convertido") {
      setAcciones({ mode: "convertir", card });
      return;
    }
    void applyEstadoChange(card.id, objetivo);
  }

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
            <div
              role="group"
              aria-label="Formato de la lista"
              className="inline-flex h-10 items-center rounded-md border border-input bg-background p-1"
            >
              {(["tabla", "kanban"] as const).map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  aria-pressed={vista === opcion}
                  onClick={() => cambiarVista(opcion)}
                  className={`h-8 rounded px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    vista === opcion
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opcion === "tabla" ? "Tabla" : "Kanban"}
                </button>
              ))}
            </div>
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
                {ESTADO_PRESUPUESTO.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {opcion}
                  </option>
                ))}
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

      {/* Main List */}
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
            {vista === "kanban" ? (
              <div className="border-t border-border p-3">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveId(null)}
                >
                  <PresupuestoPipelineKanban
                    items={pipelineCards}
                    renderCard={(card) => (
                      <KanbanDraggableCard
                        card={card}
                        disabled={pendingId === card.id}
                        onAbrirAcciones={(target) => setAcciones({ mode: "acciones", card: target })}
                      />
                    )}
                    renderColumnBody={(columnaEstado, cardsNode) => (
                      <KanbanDropZone
                        estado={columnaEstado}
                        habilitado={validTargets.has(columnaEstado)}
                        atenuada={activeCard != null}
                      >
                        {cardsNode}
                      </KanbanDropZone>
                    )}
                  />
                  <DragOverlay>
                    {activeCard ? (
                      <div className="w-56 rotate-2 opacity-90">
                        <PresupuestoKanbanCard card={activeCard} />
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            ) : (
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
                    {visibleItems.map((presupuesto) => {
                      const pacienteName = pacienteNombre(presupuesto);

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
                            <PresupuestoEstadoBadge estado={presupuesto.estado} />
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
            )}

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

      {acciones ? (
        <AccionesRapidasModal
          state={acciones}
          pending={pendingId != null}
          onClose={() => setAcciones(null)}
          onConfirmarEstado={handleConfirmarEstado}
          onConfirmarConvertir={handleConfirmarConvertir}
        />
      ) : null}
    </div>
  );
}
