"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FlaskConical,
  Loader2,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toHumanError } from "@labo/lib/error-messages";
import { EmptyState, SkeletonText } from "@labo/ui/feedback";
import { HighlightedText } from "@labo/ui/text/HighlightedText";

import { ExamenFormDialog } from "./ExamenFormDialog";
import { TituloFormDialog } from "./TituloFormDialog";

interface TituloListItem {
  id: string;
  nombre: string;
  orden: number;
}

interface ExamenItem {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
}

interface SearchResultItem {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  activo: boolean;
}

interface ApiErrorPayload {
  error?: string;
}

type LoadableList<T> =
  | { status: "idle"; items: T[]; errorMessage: null }
  | { status: "loading"; items: T[]; errorMessage: null }
  | { status: "success"; items: T[]; errorMessage: null }
  | { status: "error"; items: T[]; errorMessage: string };

interface TitulosNavigatorProps {
  initialTitulos: TituloListItem[];
}

const EMPTY_EXAMS: LoadableList<ExamenItem> = {
  status: "idle",
  items: [],
  errorMessage: null,
};

const EMPTY_SEARCH: LoadableList<SearchResultItem> = {
  status: "idle",
  items: [],
  errorMessage: null,
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

async function readApiError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return new Error(payload?.error ?? "ERROR_GENERICO");
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("UNAUTHENTICATED");
  }

  if (response.status === 403) {
    window.location.href = "/dashboard?reason=sin-permisos";
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as T;
}

function nextOrdenFrom(titulos: TituloListItem[]): number {
  const highestOrden = titulos.reduce(
    (current, titulo) => Math.max(current, titulo.orden),
    0,
  );
  return highestOrden + 1;
}

export function TitulosNavigator({ initialTitulos }: TitulosNavigatorProps) {
  const [titulos, setTitulos] = useState<TituloListItem[]>(initialTitulos);
  const [expandedTituloId, setExpandedTituloId] = useState<string | null>(
    initialTitulos[0]?.id ?? null,
  );
  const [examensByTitulo, setExamensByTitulo] = useState<Record<string, LoadableList<ExamenItem>>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [searchState, setSearchState] = useState<LoadableList<SearchResultItem>>(EMPTY_SEARCH);
  const [pageError, setPageError] = useState<string | null>(null);
  const [tituloDialogOpen, setTituloDialogOpen] = useState(false);
  const [editingTitulo, setEditingTitulo] = useState<TituloListItem | null>(null);
  const [examenDialogOpen, setExamenDialogOpen] = useState(false);
  const [selectedTituloForExamen, setSelectedTituloForExamen] = useState<TituloListItem | null>(null);
  const [editingExamen, setEditingExamen] = useState<ExamenItem | null>(null);
  const [busyTitleId, setBusyTitleId] = useState<string | null>(null);
  const [busyExamenId, setBusyExamenId] = useState<string | null>(null);

  const titulosById = useMemo(
    () => Object.fromEntries(titulos.map((titulo) => [titulo.id, titulo])) as Record<string, TituloListItem>,
    [titulos],
  );

  const refreshTitulos = useCallback(async (): Promise<TituloListItem[]> => {
    const nextTitulos = await requestJson<TituloListItem[]>("/api/examenes/titulos");
    setTitulos(nextTitulos);
    setExpandedTituloId((current) => {
      if (!current) {
        return nextTitulos[0]?.id ?? null;
      }
      return nextTitulos.some((titulo) => titulo.id === current)
        ? current
        : nextTitulos[0]?.id ?? null;
    });
    return nextTitulos;
  }, []);

  const loadExamenes = useCallback(async (tituloId: string, force = false) => {
    const currentState = examensByTitulo[tituloId] ?? EMPTY_EXAMS;
    if (!force && (currentState.status === "loading" || currentState.status === "success")) {
      return;
    }

    setExamensByTitulo((current) => ({
      ...current,
      [tituloId]: {
        status: "loading",
        items: force ? [] : current[tituloId]?.items ?? [],
        errorMessage: null,
      },
    }));

    try {
      const items = await requestJson<ExamenItem[]>(`/api/examenes?titulo_id=${tituloId}`);
      setExamensByTitulo((current) => ({
        ...current,
        [tituloId]: { status: "success", items, errorMessage: null },
      }));
    } catch (error) {
      setExamensByTitulo((current) => ({
        ...current,
        [tituloId]: {
          status: "error",
          items: current[tituloId]?.items ?? [],
          errorMessage: toHumanError(error),
        },
      }));
    }
  }, [examensByTitulo]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!expandedTituloId) {
      return;
    }

    const currentState = examensByTitulo[expandedTituloId] ?? EMPTY_EXAMS;
    if (currentState.status === "idle") {
      void loadExamenes(expandedTituloId);
    }
  }, [expandedTituloId, examensByTitulo, loadExamenes]);

  useEffect(() => {
    if (debouncedSearchTerm.length === 0) {
      setSearchState(EMPTY_SEARCH);
      return;
    }

    let cancelled = false;
    setSearchState((current) => ({
      status: "loading",
      items: current.items,
      errorMessage: null,
    }));

    void requestJson<SearchResultItem[]>(
      `/api/examenes?term=${encodeURIComponent(debouncedSearchTerm)}`,
    )
      .then((items) => {
        if (cancelled) return;
        setSearchState({ status: "success", items, errorMessage: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setSearchState({
          status: "error",
          items: [],
          errorMessage: toHumanError(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchTerm]);

  const handleToggleTitulo = async (tituloId: string) => {
    setExpandedTituloId((current) => (current === tituloId ? null : tituloId));
    if (expandedTituloId !== tituloId) {
      await loadExamenes(tituloId);
    }
  };

  const handleOpenCreateTitulo = () => {
    setEditingTitulo(null);
    setTituloDialogOpen(true);
  };

  const handleOpenEditTitulo = (titulo: TituloListItem) => {
    setEditingTitulo(titulo);
    setTituloDialogOpen(true);
  };

  const handleTituloSaved = async (titulo: TituloListItem) => {
    const nextTitulos = await refreshTitulos();
    const targetTitulo = nextTitulos.find((item) => item.id === titulo.id) ?? titulo;
    setExpandedTituloId(targetTitulo.id);
  };

  const handleMoveTitulo = async (tituloId: string, direction: -1 | 1) => {
    const currentIndex = titulos.findIndex((titulo) => titulo.id === tituloId);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= titulos.length) {
      return;
    }

    const reordered = [...titulos];
    const [currentTitulo] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, currentTitulo);

    setBusyTitleId(tituloId);
    setPageError(null);

    try {
      await requestJson<{ orderedIds: string[] }>("/api/examenes/titulos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((titulo) => titulo.id) }),
      });
      await refreshTitulos();
    } catch (error) {
      setPageError(toHumanError(error));
    } finally {
      setBusyTitleId(null);
    }
  };

  const handleDeleteTitulo = async (titulo: TituloListItem) => {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar "${titulo.nombre}"? Si tiene exámenes, el sistema lo va a rechazar.`,
    );
    if (!confirmed) {
      return;
    }

    setBusyTitleId(titulo.id);
    setPageError(null);

    try {
      await requestJson(`/api/examenes/titulos/${titulo.id}`, { method: "DELETE" });
      setExamensByTitulo((current) => {
        const next = { ...current };
        delete next[titulo.id];
        return next;
      });
      await refreshTitulos();
    } catch (error) {
      setPageError(toHumanError(error));
    } finally {
      setBusyTitleId(null);
    }
  };

  const handleOpenCreateExamen = (titulo: TituloListItem) => {
    setSelectedTituloForExamen(titulo);
    setEditingExamen(null);
    setExamenDialogOpen(true);
  };

  const handleOpenEditExamen = (titulo: TituloListItem, examen: ExamenItem) => {
    setSelectedTituloForExamen(titulo);
    setEditingExamen(examen);
    setExamenDialogOpen(true);
  };

  const handleExamenSaved = async (examen: ExamenItem) => {
    await loadExamenes(examen.titulo_id, true);
    setExpandedTituloId(examen.titulo_id);
  };

  const handleDeleteExamen = async (examen: ExamenItem) => {
    const confirmed = window.confirm(
      `¿Querés desactivar "${examen.nombre}" del catálogo?`,
    );
    if (!confirmed) {
      return;
    }

    setBusyExamenId(examen.id);
    setPageError(null);

    try {
      await requestJson(`/api/examenes/${examen.id}`, { method: "DELETE" });
      await loadExamenes(examen.titulo_id, true);
      if (debouncedSearchTerm.length > 0) {
        const items = await requestJson<SearchResultItem[]>(
          `/api/examenes?term=${encodeURIComponent(debouncedSearchTerm)}`,
        );
        setSearchState({ status: "success", items, errorMessage: null });
      }
    } catch (error) {
      setPageError(toHumanError(error));
    } finally {
      setBusyExamenId(null);
    }
  };

  const openSearchResult = async (result: SearchResultItem) => {
    setExpandedTituloId(result.titulo_id);
    await loadExamenes(result.titulo_id, true);
  };

  const nextTituloOrden = useMemo(() => nextOrdenFrom(titulos), [titulos]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="buscar-examenes" className="text-sm font-medium text-foreground">
              Buscar exámenes
            </label>
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground/70" />
              <input
                id="buscar-examenes"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Probá con hemo, perfil, glucosa..."
                className="flex h-11 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              La búsqueda usa prefijo y resalta coincidencias en los resultados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/examenes/import">
                <FileSpreadsheet />
                Importar Excel
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={handleOpenCreateTitulo}>
              <Plus />
              Nuevo título
            </Button>
          </div>
        </div>

        {pageError ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {pageError}
          </p>
        ) : null}
      </section>

      {debouncedSearchTerm.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Resultados de búsqueda</h2>
              <p className="text-sm text-muted-foreground">
                Coincidencias para <span className="font-medium">“{debouncedSearchTerm}”</span>
              </p>
            </div>
            {searchState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>

          {searchState.status === "error" ? (
            <EmptyState
              compact
              title="No pudimos completar la búsqueda"
              description={searchState.errorMessage ?? "Intentá de nuevo en unos segundos."}
              icon={<Search className="h-5 w-5" />}
            />
          ) : null}

          {searchState.status === "success" && searchState.items.length === 0 ? (
            <EmptyState
              compact
              title="Sin coincidencias"
              description="Probá con otro prefijo o abrí un título para revisar el catálogo completo."
              icon={<Search className="h-5 w-5" />}
            />
          ) : null}

          {searchState.items.length > 0 ? (
            <div className="flex flex-col gap-3">
              {searchState.items.map((result) => {
                const titulo = titulosById[result.titulo_id];
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => void openSearchResult(result)}
                    className="flex w-full flex-col gap-2 rounded-lg border border-border px-4 py-3 text-left transition hover:border-primary/30 hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-semibold text-foreground">
                          <HighlightedText text={result.nombre} term={debouncedSearchTerm} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {titulo?.nombre ?? "Título sin resolver"}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {formatUsd(result.precio_usd)}
                      </span>
                    </div>
                    {result.unidad ? (
                      <span className="text-xs text-muted-foreground">Unidad: {result.unidad}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {titulos.length === 0 ? (
        <EmptyState
          title="Todavía no hay títulos cargados"
          description="Creá el primer título para empezar a organizar el catálogo de exámenes."
          icon={<FlaskConical className="h-6 w-6" />}
          action={
            <Button type="button" onClick={handleOpenCreateTitulo}>
              <Plus />
              Nuevo título
            </Button>
          }
        />
      ) : (
        <section className="flex flex-col gap-3">
          {titulos.map((titulo, index) => {
            const isExpanded = expandedTituloId === titulo.id;
            const examenesState = examensByTitulo[titulo.id] ?? EMPTY_EXAMS;
            const isBusyTitle = busyTitleId === titulo.id;

            return (
              <article
                key={titulo.id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-border px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <button
                    type="button"
                    onClick={() => void handleToggleTitulo(titulo.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      #{index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {titulo.nombre}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          {examenesState.status === "success"
                            ? `${examenesState.items.length} exámenes`
                            : "Expandí para cargar"}
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleMoveTitulo(titulo.id, -1)}
                      disabled={index === 0 || isBusyTitle}
                    >
                      <ChevronUp />
                      Subir
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleMoveTitulo(titulo.id, 1)}
                      disabled={index === titulos.length - 1 || isBusyTitle}
                    >
                      <ChevronDown />
                      Bajar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEditTitulo(titulo)}
                    >
                      <PencilLine />
                      Editar título
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleOpenCreateExamen(titulo)}
                    >
                      <Plus />
                      Nuevo examen
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDeleteTitulo(titulo)}
                      disabled={isBusyTitle}
                    >
                      {isBusyTitle ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      Eliminar
                    </Button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="flex flex-col gap-4 px-4 py-4">
                    {examenesState.status === "loading" ? (
                      <div className="flex flex-col gap-3">
                        {Array.from({ length: 4 }, (_, index) => (
                          <div
                            key={index}
                            className="rounded-lg border border-border px-4 py-3"
                          >
                            <SkeletonText lines={2} />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {examenesState.status === "error" ? (
                      <EmptyState
                        compact
                        title="No pudimos cargar los exámenes"
                        description={examenesState.errorMessage ?? "Intentá expandir el título otra vez."}
                        icon={<FlaskConical className="h-5 w-5" />}
                        action={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void loadExamenes(titulo.id, true)}
                          >
                            Reintentar
                          </Button>
                        }
                      />
                    ) : null}

                    {examenesState.status === "success" && examenesState.items.length === 0 ? (
                      <EmptyState
                        compact
                        title="Este título todavía no tiene exámenes"
                        description="Creá el primer examen del grupo para empezar a usarlo en presupuestos y resultados."
                        icon={<FlaskConical className="h-5 w-5" />}
                        action={
                          <Button type="button" size="sm" onClick={() => handleOpenCreateExamen(titulo)}>
                            <Plus />
                            Nuevo examen
                          </Button>
                        }
                      />
                    ) : null}

                    {examenesState.items.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {examenesState.items.map((examen) => {
                          const isBusyExamen = busyExamenId === examen.id;
                          return (
                            <div
                              key={examen.id}
                              className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3 lg:flex-row lg:items-start lg:justify-between"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-semibold text-foreground">
                                    <HighlightedText text={examen.nombre} term={debouncedSearchTerm} />
                                  </h4>
                                  {examen.unidad ? (
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                      {examen.unidad}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-sm font-medium text-foreground">
                                  {formatUsd(examen.precio_usd)}
                                </p>
                                <p
                                  className={cn(
                                    "mt-1 text-sm text-muted-foreground",
                                    examen.valores_referencia ? "block" : "hidden",
                                  )}
                                >
                                  {examen.valores_referencia}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenEditExamen(titulo, examen)}
                                >
                                  <PencilLine />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleDeleteExamen(examen)}
                                  disabled={isBusyExamen}
                                >
                                  {isBusyExamen ? <Loader2 className="animate-spin" /> : <Trash2 />}
                                  Desactivar
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}

      <TituloFormDialog
        open={tituloDialogOpen}
        onOpenChange={setTituloDialogOpen}
        onSaved={(titulo) => void handleTituloSaved(titulo)}
        titulo={editingTitulo}
        initialOrden={nextTituloOrden}
      />

      {selectedTituloForExamen ? (
        <ExamenFormDialog
          open={examenDialogOpen}
          onOpenChange={(open) => {
            setExamenDialogOpen(open);
            if (!open) {
              setEditingExamen(null);
            }
          }}
          onSaved={(examen) => void handleExamenSaved(examen)}
          examen={editingExamen}
          tituloId={selectedTituloForExamen.id}
          tituloNombre={selectedTituloForExamen.nombre}
        />
      ) : null}
    </div>
  );
}
