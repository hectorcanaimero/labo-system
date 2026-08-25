"use client";

import { useMemo, useState } from "react";
import { closestCenter, DndContext, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { arrayMove, useSortable } from "@dnd-kit/sortable";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { Search, GripVertical, X, Save, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { toHumanError } from "@labo/lib/error-messages";
import { DraggableItem } from "@labo/ui/dnd/DraggableItem";
import { SortableList } from "@labo/ui/dnd/SortableList";

export interface PackageExam { id: string; titulo_id: string; nombre: string; precio_usd: number | string; unidad: string | null; valores_referencia: string | null; activo: boolean; orden: number; }
export interface PaqueteBuilderData { id: string; nombre: string; descripcion: string | null; examenes: PackageExam[]; }
interface CatalogExam { id: string; titulo_id: string; nombre: string; precio_usd: number | string; unidad: string | null; activo: boolean; }

function formatUsd(value: number | string): string { return new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(Number(value)); }
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) } }); if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error ?? `REQUEST_FAILED_${response.status}`); } return response.json() as Promise<T>; }

function SortableExamRow({ item, canEdit, onRemove }: { item: PackageExam; canEdit: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `exam:${item.id}`, disabled: !canEdit });
  return <DraggableItem id={`exam:${item.id}`} ref={setNodeRef} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}> <div className="flex items-center gap-3 px-4 py-3" {...attributes}><button type="button" aria-label={`Mover ${item.nombre}`} className="cursor-grab text-muted-foreground disabled:cursor-default" disabled={!canEdit} {...listeners}><GripVertical className="h-4 w-4" /></button><span className="min-w-0 flex-1 truncate text-sm">{item.nombre}</span><span className="text-xs text-muted-foreground">{formatUsd(item.precio_usd)}</span>{canEdit ? <button type="button" onClick={onRemove} aria-label={`Quitar ${item.nombre}`} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-4 w-4" /></button> : null}</div></DraggableItem>;
}

function CatalogRow({ exam, selected, disabled, onAdd }: { exam: CatalogExam; selected: boolean; disabled: boolean; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `catalog:${exam.id}`, disabled: disabled || selected });
  return <button ref={setNodeRef} type="button" onClick={onAdd} disabled={disabled || selected} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }} className={`flex w-full items-center gap-3 border-b border-border/70 px-4 py-3 text-left transition hover:bg-muted/60 disabled:cursor-default disabled:opacity-45 ${isDragging ? "opacity-40" : ""}`} {...listeners} {...attributes}><GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{exam.nombre}</span><span className="text-xs text-muted-foreground">{formatUsd(exam.precio_usd)}</span></button>;
}

export function PaqueteBuilder({ initialData, canEdit }: { initialData: PaqueteBuilderData; canEdit: boolean }) {
  const [items, setItems] = useState<PackageExam[]>(initialData.examenes);
  const [catalog, setCatalog] = useState<CatalogExam[]>([]);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const filteredCatalog = useMemo(() => catalog.filter((exam) => exam.nombre.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [catalog, search]);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: "package-drop" });

  async function loadCatalog(value: string): Promise<void> { setSearch(value); if (!value.trim()) { setCatalog([]); return; } try { setCatalog(await requestJson<CatalogExam[]>(`/api/examenes?term=${encodeURIComponent(value.trim())}`)); } catch (error) { setMessage(toHumanError(error)); } }
  function addExam(id: string): void { const exam = catalog.find((item) => item.id === id); if (!exam || selectedIds.has(id)) return; setItems((current) => [...current, { ...exam, valores_referencia: null, orden: current.length }]); }
  function removeExam(id: string): void { if (canEdit) setItems((current) => current.filter((item) => item.id !== id)); }
  function handleDragStart(event: DragStartEvent): void { setActiveId(String(event.active.id)); }
  function handleDragEnd(event: DragEndEvent): void { setActiveId(null); const source = String(event.active.id); const over = event.over ? String(event.over.id) : null; if (source.startsWith("catalog:")) { if (over === "package-drop" || over?.startsWith("exam:")) addExam(source.slice(8)); return; } if (!over || over === "package-drop") return; const from = items.findIndex((item) => `exam:${item.id}` === source); const to = items.findIndex((item) => `exam:${item.id}` === over); if (from >= 0 && to >= 0 && from !== to) setItems((current) => arrayMove(current, from, to)); }
  async function save(): Promise<void> { setBusy(true); setMessage(null); try { await requestJson(`/api/paquetes/${initialData.id}/examenes`, { method: "PUT", body: JSON.stringify({ examenIds: items.map((item) => item.id) }) }); setMessage("Paquete guardado."); } catch (error) { setMessage(toHumanError(error)); } finally { setBusy(false); } }

  return <div className="mx-auto flex max-w-7xl flex-col gap-6"><Link href="/paquetes" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Volver a paquetes</Link><header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Constructor</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{initialData.nombre}</h1><p className="mt-2 text-sm text-muted-foreground">{initialData.descripcion || "Elegí los exámenes y ordenalos como quieras."}</p></div>{canEdit ? <Button onClick={() => void save()} disabled={busy}><Save /> {busy ? "Guardando…" : "Guardar cambios"}</Button> : <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Solo lectura</span>}</header>{message ? <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{message}</p> : null}<DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}><div className="grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border bg-muted/25 p-4"><h2 className="font-semibold">Catálogo de exámenes</h2><div className="relative mt-3"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => void loadCatalog(event.target.value)} placeholder="Buscar por nombre…" disabled={!canEdit} className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></div></div><div className="max-h-[32rem] overflow-y-auto">{filteredCatalog.length ? filteredCatalog.map((exam) => <CatalogRow key={exam.id} exam={exam} selected={selectedIds.has(exam.id)} disabled={!canEdit} onAdd={() => addExam(exam.id)} />) : <p className="p-8 text-center text-sm text-muted-foreground">Escribí para buscar exámenes activos.</p>}</div></section><section ref={setDropRef} className={`min-h-[20rem] overflow-hidden rounded-2xl border bg-card transition ${isOver ? "border-primary bg-primary/5" : "border-border"}`}><div className="flex items-center justify-between border-b border-border bg-muted/25 p-4"><div><h2 className="font-semibold">Este paquete</h2><p className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "examen" : "exámenes"}</p></div></div><SortableList items={items.map((item) => `exam:${item.id}`)} className="divide-y divide-border/70">{items.length ? items.map((item) => <SortableExamRow key={item.id} item={item} canEdit={canEdit} onRemove={() => removeExam(item.id)} />) : <p className="p-10 text-center text-sm text-muted-foreground">Arrastrá exámenes acá para armar el paquete.</p>}</SortableList></section></div><DragOverlay>{activeId ? <div className="rounded-lg border border-primary bg-card px-4 py-3 text-sm shadow-xl">{activeId.startsWith("catalog:") ? catalog.find((exam) => `catalog:${exam.id}` === activeId)?.nombre : items.find((exam) => `exam:${exam.id}` === activeId)?.nombre}</div> : null}</DragOverlay></DndContext></div>;
}
