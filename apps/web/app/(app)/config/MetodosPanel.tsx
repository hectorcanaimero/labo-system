"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";

import { toHumanError } from "@labo/lib/error-messages";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@labo/ui/feedback";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";

/**
 * Administración de los métodos de análisis (F7.4.T1).
 *
 * El examen ya no acepta texto libre: elige de esta lista. Acá el admin la
 * amplía, renombra y desactiva.
 *
 * Renombrar NO reescribe los exámenes que ya usaban el nombre viejo, ni el
 * `metodo_snap` de las órdenes, que es un registro histórico. Por eso el aviso
 * al renombrar: la lista y lo ya guardado pueden divergir a propósito.
 */

interface MetodoAnalisis {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
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
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `REQUEST_FAILED_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function MetodosPanel() {
  const [metodos, setMetodos] = useState<MetodoAnalisis[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nuevo, setNuevo] = useState("");
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const payload = await requestJson<MetodoAnalisis[]>(
          "/api/examenes/metodos?incluirInactivos=1",
        );
        if (!cancelado) {
          setMetodos(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelado) setError(toHumanError(err));
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  function reemplazar(actualizado: MetodoAnalisis): void {
    setMetodos((actuales) =>
      actuales.map((item) => (item.id === actualizado.id ? actualizado : item)),
    );
  }

  async function crear(): Promise<void> {
    const nombre = nuevo.trim();
    if (nombre.length === 0) return;
    try {
      setCreando(true);
      const creado = await requestJson<MetodoAnalisis>("/api/examenes/metodos", {
        method: "POST",
        body: JSON.stringify({ nombre }),
      });
      setMetodos((actuales) => [...actuales, creado]);
      setNuevo("");
      notifySuccess(`Método "${creado.nombre}" agregado.`);
    } catch (err) {
      notifyError(err);
    } finally {
      setCreando(false);
    }
  }

  async function guardarNombre(metodo: MetodoAnalisis): Promise<void> {
    const nombre = nombreEditado.trim();
    if (nombre.length === 0 || nombre === metodo.nombre) {
      setEditandoId(null);
      return;
    }
    try {
      setGuardandoId(metodo.id);
      const actualizado = await requestJson<MetodoAnalisis>("/api/examenes/metodos", {
        method: "PATCH",
        body: JSON.stringify({ id: metodo.id, nombre }),
      });
      reemplazar(actualizado);
      setEditandoId(null);
      notifySuccess(
        `Método renombrado. Los exámenes que ya usaban "${metodo.nombre}" conservan ese nombre.`,
      );
    } catch (err) {
      notifyError(err);
    } finally {
      setGuardandoId(null);
    }
  }

  async function alternarActivo(metodo: MetodoAnalisis): Promise<void> {
    try {
      setGuardandoId(metodo.id);
      const actualizado = await requestJson<MetodoAnalisis>("/api/examenes/metodos", {
        method: "PATCH",
        body: JSON.stringify({ id: metodo.id, activo: !metodo.activo }),
      });
      reemplazar(actualizado);
      notifySuccess(
        actualizado.activo
          ? `"${actualizado.nombre}" vuelve al selector.`
          : `"${actualizado.nombre}" ya no aparece en el selector.`,
      );
    } catch (err) {
      notifyError(err);
    } finally {
      setGuardandoId(null);
    }
  }

  return (
    <Card className="shadow-none lg:col-span-3">
      <CardHeader className="border-b border-border py-3">
        <CardTitle className="text-sm font-semibold">Métodos de análisis</CardTitle>
        <CardDescription className="text-xs">
          La lista que ofrece el selector de método en cada examen. Desactivar saca el método
          del selector; los exámenes que ya lo tenían lo siguen mostrando.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={nuevo}
            onChange={(event) => setNuevo(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void crear();
              }
            }}
            placeholder="Ej. Quimioluminiscencia"
            aria-label="Nombre del método nuevo"
            disabled={creando}
            className="h-9 sm:max-w-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void crear()}
            disabled={creando || nuevo.trim().length === 0}
          >
            {creando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Agregar método
          </Button>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : cargando ? (
          <p className="text-xs text-muted-foreground">Cargando métodos…</p>
        ) : metodos.length === 0 ? (
          <EmptyState
            compact
            title="Todavía no hay métodos"
            description="Agregá el primero para que aparezca en el selector de los exámenes."
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {metodos.map((metodo) => {
              const ocupado = guardandoId === metodo.id;
              const editando = editandoId === metodo.id;

              return (
                <li key={metodo.id} className="flex items-center gap-2 px-3 py-2">
                  {editando ? (
                    <>
                      <Input
                        value={nombreEditado}
                        onChange={(event) => setNombreEditado(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void guardarNombre(metodo);
                          }
                          if (event.key === "Escape") setEditandoId(null);
                        }}
                        aria-label={`Nuevo nombre para ${metodo.nombre}`}
                        autoFocus
                        disabled={ocupado}
                        className="h-8 max-w-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void guardarNombre(metodo)}
                        disabled={ocupado}
                        aria-label="Guardar nombre"
                      >
                        {ocupado ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditandoId(null)}
                        disabled={ocupado}
                        aria-label="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          metodo.activo ? "" : "text-muted-foreground line-through"
                        }`}
                      >
                        {metodo.nombre}
                      </span>
                      {!metodo.activo ? (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Desactivado
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditandoId(metodo.id);
                          setNombreEditado(metodo.nombre);
                        }}
                        disabled={ocupado}
                        aria-label={`Renombrar ${metodo.nombre}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void alternarActivo(metodo)}
                        disabled={ocupado}
                        className="h-8 text-xs"
                      >
                        {ocupado ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {metodo.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
