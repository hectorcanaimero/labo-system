"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PackageOpen, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Paquete { id: string; nombre: string; descripcion: string | null; examenes_count: number; }

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error ?? `REQUEST_FAILED_${response.status}`); }
  return response.json() as Promise<T>;
}

export default function PaquetesPage() {
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh(): Promise<void> { setLoading(true); try { const [items, me] = await Promise.all([requestJson<Paquete[]>("/api/paquetes"), requestJson<{ role: string }>("/api/me")]); setPaquetes(items); setRole(me.role); setError(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cargar la lista."); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  async function createPaquete(event: React.FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); setSaving(true); try { const created = await requestJson<Paquete>("/api/paquetes", { method: "POST", body: JSON.stringify({ nombre, descripcion }) }); setPaquetes((current) => [...current, created]); setOpen(false); setNombre(""); setDescripcion(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el paquete."); } finally { setSaving(false); } }
  const canManage = role === "admin";

  return <div className="mx-auto flex max-w-6xl flex-col gap-8"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Catálogo reutilizable</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Paquetes</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Armá combinaciones de exámenes para cargarlas en resultados y presupuestos en un clic.</p></div>{canManage ? <Button onClick={() => setOpen(true)}><Plus /> Nuevo paquete</Button> : null}</header>{error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}{loading ? <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Cargando paquetes…</div> : paquetes.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center"><PackageOpen className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">Todavía no hay paquetes</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Creá el primero para dejar de repetir selecciones manualmente.</p>{canManage ? <Button className="mt-6" onClick={() => setOpen(true)}><Plus /> Crear paquete</Button> : null}</div> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{paquetes.map((paquete) => <Link key={paquete.id} href={`/paquetes/${paquete.id}`} className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div><p className="text-lg font-semibold group-hover:text-primary">{paquete.nombre}</p><p className="mt-1 text-sm text-muted-foreground">{paquete.descripcion || "Sin descripción"}</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{paquete.examenes_count} {paquete.examenes_count === 1 ? "examen" : "exámenes"}</span></div><p className="mt-8 text-xs font-medium uppercase tracking-wider text-muted-foreground">Abrir constructor →</p></Link>)}</div>}{open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={(event) => void createPaquete(event)} className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Nuevo paquete</h2><p className="mt-1 text-sm text-muted-foreground">Después vas a poder ordenar sus exámenes.</p></div><button type="button" aria-label="Cerrar" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div><label className="mt-6 block text-sm font-medium">Nombre<input required value={nombre} onChange={(event) => setNombre(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label><label className="mt-4 block text-sm font-medium">Descripción<span className="font-normal text-muted-foreground"> (opcional)</span><textarea value={descripcion} onChange={(event) => setDescripcion(event.target.value)} rows={3} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Creando…" : "Crear paquete"}</Button></div></form></div> : null}</div>;
}
