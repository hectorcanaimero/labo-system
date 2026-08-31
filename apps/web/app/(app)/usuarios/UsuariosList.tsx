"use client";

import { useState } from "react";
import { Ban, Loader2, RotateCcw, Shield, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteUserDialog } from "./InviteUserDialog";

export interface UsuarioItem {
  id: string;
  email: string;
  nombre: string;
  role: "admin" | "operador";
  activo: boolean;
  created_at: string;
}

interface UsuariosListProps {
  currentUserId: string;
  initialUsuarios: UsuarioItem[];
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function UsuariosList({ currentUserId, initialUsuarios }: UsuariosListProps) {
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>(initialUsuarios);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const res = await fetch("/api/usuarios", { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo cargar la lista de usuarios.");
    const data = (await res.json()) as { usuarios: UsuarioItem[] };
    setUsuarios(data.usuarios);
  }

  async function patchUsuario(id: string, body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`/api/usuarios/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "No se pudo actualizar el usuario.");
    }
  }

  const handleChangeRole = async (usuario: UsuarioItem, role: "admin" | "operador") => {
    if (usuario.role === role) return;
    setBusyId(usuario.id);
    setError(null);
    setNotice(null);
    try {
      await patchUsuario(usuario.id, { role });
      await refresh();
      setNotice(`${usuario.nombre} ahora es ${role === "admin" ? "Administrador" : "Operador"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el rol.");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActivo = async (usuario: UsuarioItem) => {
    setBusyId(usuario.id);
    setError(null);
    setNotice(null);
    try {
      await patchUsuario(usuario.id, { activo: !usuario.activo });
      await refresh();
      setNotice(`${usuario.nombre} fue ${usuario.activo ? "desactivado" : "reactivado"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el estado.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-border bg-muted/20 p-2">
        <InviteUserDialog
          onSuccess={(msg) => {
            setError(null);
            setNotice(msg);
          }}
          onError={(msg) => setError(msg)}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}

      <Card className="shadow-none">
        <CardContent className="p-0">
          {usuarios.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Todavía no hay usuarios. Invitá al primero para empezar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 py-1.5">Nombre</TableHead>
                  <TableHead className="h-9 py-1.5">Email</TableHead>
                  <TableHead className="h-9 w-40 py-1.5">Rol</TableHead>
                  <TableHead className="h-9 w-24 py-1.5">Estado</TableHead>
                  <TableHead className="h-9 w-28 py-1.5">Alta</TableHead>
                  <TableHead className="h-9 w-32 py-1.5 text-right">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((usuario) => {
                  const isSelf = usuario.id === currentUserId;
                  const isBusy = busyId === usuario.id;

                  return (
                    <TableRow key={usuario.id} className="h-9">
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">
                            {usuario.nombre}
                          </span>
                          {isSelf ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              Vos
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate py-1.5 text-xs text-muted-foreground">
                        {usuario.email}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-1.5">
                          {usuario.role === "admin" ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <select
                            value={usuario.role}
                            disabled={isSelf || isBusy}
                            aria-label={`Rol de ${usuario.nombre}`}
                            onChange={(event) =>
                              void handleChangeRole(
                                usuario,
                                event.target.value as "admin" | "operador",
                              )
                            }
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="admin">Administrador</option>
                            <option value="operador">Operador</option>
                          </select>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5">
                        {usuario.activo ? (
                          <span className="inline-flex h-5 items-center rounded bg-emerald-100 px-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex h-5 items-center rounded bg-zinc-100 px-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                            Inactivo
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatFecha(usuario.created_at)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={isSelf || isBusy}
                          onClick={() => void handleToggleActivo(usuario)}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : usuario.activo ? (
                            <Ban className="h-3 w-3" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          {usuario.activo ? "Desactivar" : "Reactivar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
