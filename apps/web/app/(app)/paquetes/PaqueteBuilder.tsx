"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { arrayMove, useSortable } from "@dnd-kit/sortable";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  Search,
  GripVertical,
  X,
  Save,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Layers,
  Wand2,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toHumanError } from "@labo/lib/error-messages";
import { DraggableItem } from "@labo/ui/dnd/DraggableItem";
import { SortableList } from "@labo/ui/dnd/SortableList";

export interface PackageExam {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number | string;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
  orden: number;
}

export interface PackageTituloRef {
  id: string;
  nombre: string;
  orden: number;
  examenes_activos_count: number;
}

export interface PaqueteBuilderData {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_base: number;
  precio_calculado: number;
  examenes: PackageExam[];
  titulos: PackageTituloRef[];
}

interface CatalogExam {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number | string;
  unidad: string | null;
  activo: boolean;
}

interface Titulo {
  id: string;
  nombre: string;
}

function formatUsd(value: number | string): string {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `REQUEST_FAILED_${response.status}`);
  }
  return response.json() as Promise<T>;
}

function SortableExamRow({
  item,
  canEdit,
  onRemove,
}: {
  item: PackageExam;
  canEdit: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `exam:${item.id}`,
    disabled: !canEdit,
  });
  return (
    <DraggableItem
      id={`exam:${item.id}`}
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-2" {...attributes}>
        <button
          type="button"
          aria-label={`Mover ${item.nombre}`}
          className="cursor-grab text-muted-foreground disabled:cursor-default"
          disabled={!canEdit}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm">{item.nombre}</span>
        <span className="text-xs text-muted-foreground">{formatUsd(item.precio_usd)}</span>
        {canEdit ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar ${item.nombre}`}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </DraggableItem>
  );
}

function CatalogRow({
  exam,
  selected,
  disabled,
  onAdd,
}: {
  exam: CatalogExam;
  selected: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `catalog:${exam.id}`,
    disabled: disabled || selected,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onAdd}
      disabled={disabled || selected}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      className={`flex w-full items-center gap-3 border-b border-border/70 px-4 py-2 text-left transition hover:bg-muted/60 disabled:cursor-default disabled:opacity-45 ${isDragging ? "opacity-40" : ""}`}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{exam.nombre}</span>
      <span className="text-xs text-muted-foreground">{formatUsd(exam.precio_usd)}</span>
    </button>
  );
}

export function PaqueteBuilder({
  initialData,
  canEdit,
}: {
  initialData: PaqueteBuilderData;
  canEdit: boolean;
}) {
  const [items, setItems] = useState<PackageExam[]>(initialData.examenes);
  const [precioBase, setPrecioBase] = useState<string>(
    initialData.precio_base.toString(),
  );

  // Grupos (títulos) incluidos por referencia dinámica.
  const [selectedTitulos, setSelectedTitulos] = useState<PackageTituloRef[]>(
    initialData.titulos,
  );

  // Catálogo
  const [catalog, setCatalog] = useState<CatalogExam[]>([]);
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [examsByTitulo, setExamsByTitulo] = useState<Record<string, CatalogExam[]>>({});
  const [expandedTitulo, setExpandedTitulo] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    requestJson<Titulo[]>("/api/examenes/titulos").then(setTitulos).catch(() => {});
  }, []);

  // Pre-cargar los exámenes de los grupos ya incluidos, para poder calcular
  // la suma sugerida sin esperar a que el usuario los expanda.
  useEffect(() => {
    const missing = selectedTitulos
      .map((t) => t.id)
      .filter((id) => !examsByTitulo[id]);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (id) => {
        try {
          const exams = await requestJson<CatalogExam[]>(
            `/api/examenes?titulo_id=${id}`,
          );
          setExamsByTitulo((curr) => ({ ...curr, [id]: exams }));
        } catch {
          // silencioso: el cálculo cae en 0 para ese grupo
        }
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTitulos.length]);

  const selectedExamIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const selectedTituloIds = useMemo(
    () => new Set(selectedTitulos.map((t) => t.id)),
    [selectedTitulos],
  );

  const filteredCatalog = useMemo(
    () =>
      catalog.filter((exam) =>
        exam.nombre.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [catalog, search],
  );

  const allKnownExams = useMemo(() => {
    const map = new Map<string, CatalogExam>();
    catalog.forEach((e) => map.set(e.id, e));
    Object.values(examsByTitulo).flat().forEach((e) => map.set(e.id, e));
    return map;
  }, [catalog, examsByTitulo]);

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: "package-drop" });

  async function loadCatalog(value: string): Promise<void> {
    setSearch(value);
    if (!value.trim()) {
      setCatalog([]);
      return;
    }
    try {
      setCatalog(
        await requestJson<CatalogExam[]>(
          `/api/examenes?term=${encodeURIComponent(value.trim())}`,
        ),
      );
    } catch (error) {
      setMessage(toHumanError(error));
    }
  }

  async function toggleTitulo(id: string) {
    if (expandedTitulo === id) {
      setExpandedTitulo(null);
      return;
    }
    setExpandedTitulo(id);
    if (!examsByTitulo[id]) {
      try {
        const exams = await requestJson<CatalogExam[]>(`/api/examenes?titulo_id=${id}`);
        setExamsByTitulo((curr) => ({ ...curr, [id]: exams }));
      } catch (error) {
        setMessage(toHumanError(error));
      }
    }
  }

  function addExamById(id: string): void {
    const exam = allKnownExams.get(id);
    if (!exam || selectedExamIds.has(id)) return;
    setItems((current) => [
      ...current,
      { ...exam, valores_referencia: null, orden: current.length },
    ]);
  }

  async function addTituloAsGroup(titulo: Titulo, event: React.MouseEvent) {
    event.stopPropagation();
    if (selectedTituloIds.has(titulo.id)) return;

    // Cargar exámenes del grupo si aún no los tenemos (para el cálculo).
    let exams = examsByTitulo[titulo.id];
    if (!exams) {
      try {
        exams = await requestJson<CatalogExam[]>(`/api/examenes?titulo_id=${titulo.id}`);
        setExamsByTitulo((curr) => ({ ...curr, [titulo.id]: exams! }));
      } catch (error) {
        setMessage(toHumanError(error));
        return;
      }
    }

    setSelectedTitulos((curr) => [
      ...curr,
      {
        id: titulo.id,
        nombre: titulo.nombre,
        orden: curr.length,
        examenes_activos_count: exams!.length,
      },
    ]);
  }

  function removeTitulo(id: string): void {
    if (!canEdit) return;
    setSelectedTitulos((curr) => curr.filter((t) => t.id !== id));
  }

  function removeExam(id: string): void {
    if (canEdit) setItems((current) => current.filter((item) => item.id !== id));
  }

  function handleDragStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveId(null);
    const source = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    if (source.startsWith("catalog:")) {
      if (over === "package-drop" || over?.startsWith("exam:")) {
        addExamById(source.slice(8));
      }
      return;
    }
    if (!over || over === "package-drop") return;
    const from = items.findIndex((item) => `exam:${item.id}` === source);
    const to = items.findIndex((item) => `exam:${item.id}` === over);
    if (from >= 0 && to >= 0 && from !== to) {
      setItems((current) => arrayMove(current, from, to));
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const pBase = parseFloat(precioBase) || 0;
      await Promise.all([
        requestJson(`/api/paquetes/${initialData.id}`, {
          method: "PATCH",
          body: JSON.stringify({ precio_base: pBase }),
        }),
        requestJson(`/api/paquetes/${initialData.id}/examenes`, {
          method: "PUT",
          body: JSON.stringify({ examenIds: items.map((item) => item.id) }),
        }),
        requestJson(`/api/paquetes/${initialData.id}/titulos`, {
          method: "PUT",
          body: JSON.stringify({ tituloIds: selectedTitulos.map((t) => t.id) }),
        }),
      ]);
      setMessage("Paquete guardado.");
    } catch (error) {
      setMessage(toHumanError(error));
    } finally {
      setBusy(false);
    }
  }

  // Suma sugerida: exámenes sueltos + exámenes activos de grupos incluidos.
  // Cuenta cada examen una sola vez (si un suelto está en un grupo, no dobla).
  const sumaSugerida = useMemo(() => {
    const seen = new Set<string>();
    let total = 0;
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      total += Number(it.precio_usd);
    }
    for (const t of selectedTitulos) {
      const exams = examsByTitulo[t.id] ?? [];
      for (const e of exams) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        total += Number(e.precio_usd);
      }
    }
    return Number(total.toFixed(2));
  }, [items, selectedTitulos, examsByTitulo]);

  const pBaseNum = parseFloat(precioBase) || 0;
  const ahorroMonto = sumaSugerida - pBaseNum;
  const ahorroPorcentaje = sumaSugerida > 0 ? (ahorroMonto / sumaSugerida) * 100 : 0;
  const isWarning = pBaseNum > sumaSugerida;

  function applySuggestedPrice() {
    setPrecioBase(sumaSugerida.toFixed(2));
  }

  return (
    <div className="mx-auto flex max-w-[100rem] flex-col gap-4">
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <Link
          href="/paquetes"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Paquetes
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {initialData.nombre}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {initialData.descripcion ||
                "Combiná grupos y exámenes sueltos. El precio base es lo que cobrás — la suma es referencia."}
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => void save()}
              disabled={busy}
            >
              <Save className="h-3.5 w-3.5" />
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          ) : (
            <span className="inline-flex h-6 items-center rounded bg-muted px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Solo lectura
            </span>
          )}
        </div>
      </header>

      {message ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
          {message}
        </p>
      ) : null}

      <Card
        className={`shadow-none ${isWarning ? "border-destructive/40 bg-destructive/5" : ""}`}
      >
        <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Suma sugerida</span>
            <span className="font-mono tabular-nums font-semibold text-foreground">
              {formatUsd(sumaSugerida)}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span
              className={
                isWarning
                  ? "font-semibold text-destructive"
                  : "font-semibold text-emerald-600"
              }
            >
              {ahorroMonto >= 0 ? "Ahorro" : "Sobreprecio"}{" "}
              <span className="font-mono tabular-nums">
                {formatUsd(Math.abs(ahorroMonto))}
              </span>{" "}
              ({Math.abs(ahorroPorcentaje).toFixed(1)}%)
            </span>
            {isWarning ? (
              <span className="text-[11px] text-destructive">
                Precio base mayor a la suma sugerida.
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="precio_base"
              className="whitespace-nowrap text-xs font-medium text-foreground"
            >
              Precio base
            </label>
            <div className="relative w-28">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                $
              </span>
              <Input
                id="precio_base"
                type="number"
                step="0.01"
                min="0"
                disabled={!canEdit}
                value={precioBase}
                onChange={(e) => setPrecioBase(e.target.value)}
                className="h-8 pl-5 font-mono text-xs tabular-nums"
              />
            </div>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={applySuggestedPrice}
                disabled={sumaSugerida === 0}
                title="Copiar la suma sugerida al precio base"
              >
                <Wand2 className="h-3 w-3" />
                Sugerido
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="flex h-[38rem] flex-col overflow-hidden rounded-md border border-border bg-card">
            <div className="shrink-0 border-b border-border bg-muted/30 p-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Catálogo
                </h2>
              </div>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => void loadCatalog(event.target.value)}
                  placeholder="Buscar exámenes por nombre…"
                  disabled={!canEdit}
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {search.trim().length > 0 ? (
                filteredCatalog.length > 0 ? (
                  filteredCatalog.map((exam) => (
                    <CatalogRow
                      key={exam.id}
                      exam={exam}
                      selected={selectedExamIds.has(exam.id)}
                      disabled={!canEdit}
                      onAdd={() => addExamById(exam.id)}
                    />
                  ))
                ) : (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No se encontraron exámenes.
                  </p>
                )
              ) : (
                <div className="flex flex-col">
                  {titulos.length > 0 ? (
                    titulos.map((titulo) => {
                      const isTituloIncluido = selectedTituloIds.has(titulo.id);
                      return (
                        <div
                          key={titulo.id}
                          className="border-b border-border/70 last:border-0"
                        >
                          <div
                            className="flex cursor-pointer items-center justify-between p-3 transition hover:bg-muted/30"
                            onClick={() => void toggleTitulo(titulo.id)}
                          >
                            <div className="flex items-center gap-2 font-medium">
                              {expandedTitulo === titulo.id ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                              {titulo.nombre}
                              {isTituloIncluido ? (
                                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  incluido
                                </span>
                              ) : null}
                            </div>
                            {canEdit && !isTituloIncluido ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => void addTituloAsGroup(titulo, e)}
                              >
                                <Layers className="h-3 w-3" /> Incluir grupo
                              </Button>
                            ) : null}
                          </div>
                          {expandedTitulo === titulo.id && (
                            <div className="border-t border-border/30 bg-muted/10">
                              {examsByTitulo[titulo.id] ? (
                                examsByTitulo[titulo.id]!.length > 0 ? (
                                  examsByTitulo[titulo.id]!.map((exam) => (
                                    <CatalogRow
                                      key={exam.id}
                                      exam={exam}
                                      selected={selectedExamIds.has(exam.id)}
                                      disabled={!canEdit || isTituloIncluido}
                                      onAdd={() => addExamById(exam.id)}
                                    />
                                  ))
                                ) : (
                                  <p className="px-4 py-3 text-xs text-muted-foreground">
                                    No hay exámenes activos en este grupo.
                                  </p>
                                )
                              ) : (
                                <p className="px-4 py-3 text-xs text-muted-foreground">
                                  Cargando…
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      Cargando grupos…
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          <section
            ref={setDropRef}
            className={`flex h-[38rem] flex-col overflow-hidden rounded-md border bg-card transition ${isOver ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 p-2.5">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Este paquete
                </h2>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {selectedTitulos.length}{" "}
                  {selectedTitulos.length === 1 ? "grupo" : "grupos"} · {items.length}{" "}
                  {items.length === 1 ? "suelto" : "sueltos"}
                </p>
              </div>
            </div>

            <div className="flex-1 divide-y divide-border/60 overflow-y-auto">
              {selectedTitulos.length > 0 ? (
                <div>
                  <div className="bg-primary/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                    Grupos incluidos (referencia dinámica)
                  </div>
                  {selectedTitulos.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20"
                    >
                      <Layers className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {t.nombre}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.examenes_activos_count}{" "}
                        {t.examenes_activos_count === 1 ? "examen" : "exámenes"}
                      </span>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => removeTitulo(t.id)}
                          aria-label={`Quitar grupo ${t.nombre}`}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div>
                {items.length > 0 || selectedTitulos.length > 0 ? (
                  <div className="bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Exámenes sueltos
                  </div>
                ) : null}
                <SortableList
                  items={items.map((item) => `exam:${item.id}`)}
                  className="divide-y divide-border/60"
                >
                  {items.length ? (
                    items.map((item) => (
                      <SortableExamRow
                        key={item.id}
                        item={item}
                        canEdit={canEdit}
                        onRemove={() => removeExam(item.id)}
                      />
                    ))
                  ) : selectedTitulos.length === 0 ? (
                    <p className="p-10 text-center text-sm text-muted-foreground">
                      Arrastrá exámenes acá, hacé clic en el catálogo, o incluí un grupo completo desde la izquierda.
                    </p>
                  ) : (
                    <p className="px-4 py-3 text-xs text-muted-foreground">
                      Sin exámenes sueltos. El paquete se arma con los grupos incluidos.
                    </p>
                  )}
                </SortableList>
              </div>
            </div>
          </section>
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="rounded-lg border border-primary bg-card px-4 py-3 text-sm shadow-xl">
              {activeId.startsWith("catalog:")
                ? allKnownExams.get(activeId.slice(8))?.nombre
                : items.find((exam) => `exam:${exam.id}` === activeId)?.nombre}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
