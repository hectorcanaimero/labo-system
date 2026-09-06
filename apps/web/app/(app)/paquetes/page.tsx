"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, PackageOpen, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";

interface Paquete {
  id: string;
  nombre: string;
  descripcion: string | null;
  examenes_count: number;
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

export default function PaquetesPage() {
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precioBase, setPrecioBase] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const [items, me] = await Promise.all([
        requestJson<Paquete[]>("/api/paquetes"),
        requestJson<{ role: string }>("/api/me"),
      ]);
      setPaquetes(items);
      setRole(me.role);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo cargar la lista.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createPaquete(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try {
      const precio_base = parseFloat(precioBase) || 0;
      const created = await requestJson<Paquete>("/api/paquetes", {
        method: "POST",
        body: JSON.stringify({ nombre, descripcion, precio_base }),
      });
      setPaquetes((current) => [...current, created]);
      setOpen(false);
      setNombre("");
      setDescripcion("");
      setPrecioBase("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo crear el paquete.",
      );
    } finally {
      setSaving(false);
    }
  }

  const canManage = role === "admin";
  const filtered = q
    ? paquetes.filter((p) =>
        `${p.nombre} ${p.descripcion ?? ""}`.toLowerCase().includes(q.toLowerCase()),
      )
    : paquetes;

  return (
    <div className="mx-auto flex max-w-[100rem] flex-col gap-4">
      <PageHeader
        title="Paquetes"
        count={paquetes.length}
        description="Combinaciones reutilizables de exámenes para presupuestos y órdenes."
      />

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {/* Filter bar densa */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o descripción…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo paquete
          </Button>
        ) : null}
      </div>

      {loading ? (
        <Card className="shadow-none">
          <CardContent className="p-6 text-center text-xs text-muted-foreground">
            Cargando paquetes…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <PackageOpen className="h-8 w-8 text-muted-foreground/60" />
            <div>
              <h2 className="text-sm font-semibold">
                {q ? "Sin resultados" : "Todavía no hay paquetes"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {q
                  ? "Probá con otro término de búsqueda."
                  : "Creá el primero para dejar de repetir selecciones manualmente."}
              </p>
            </div>
            {canManage && !q ? (
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={() => setOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Crear paquete
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 py-1.5">Nombre</TableHead>
                  <TableHead className="h-9 py-1.5">Descripción</TableHead>
                  <TableHead className="h-9 w-24 py-1.5 text-right">
                    Exámenes
                  </TableHead>
                  <TableHead className="h-9 w-24 py-1.5 text-right">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((paquete) => (
                  <TableRow key={paquete.id} className="h-9">
                    <TableCell className="py-1.5 font-medium text-foreground">
                      {paquete.nombre}
                    </TableCell>
                    <TableCell className="max-w-md truncate py-1.5 text-xs text-muted-foreground">
                      {paquete.descripcion || "—"}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-xs tabular-nums text-foreground">
                      {paquete.examenes_count}
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <Link href={`/paquetes/${paquete.id}`}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                        >
                          Abrir
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog nuevo paquete */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (saving) return;
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={(event) => void createPaquete(event)}>
            <DialogHeader>
              <DialogTitle className="text-base">Nuevo paquete</DialogTitle>
              <DialogDescription className="text-xs">
                Después vas a poder ordenar los exámenes y ajustar el precio.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pkg-nombre" className="text-xs">
                  Nombre
                </Label>
                <Input
                  id="pkg-nombre"
                  required
                  value={nombre}
                  onChange={(event) => setNombre(event.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pkg-descripcion" className="text-xs">
                  Descripción{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </Label>
                <textarea
                  id="pkg-descripcion"
                  value={descripcion}
                  onChange={(event) => setDescripcion(event.target.value)}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pkg-precio" className="text-xs">
                  Precio base (USD){" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </Label>
                <Input
                  id="pkg-precio"
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioBase}
                  onChange={(event) => setPrecioBase(event.target.value)}
                  className="h-8 font-mono text-xs tabular-nums"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="h-8" disabled={saving}>
                {saving ? "Creando…" : "Crear paquete"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
