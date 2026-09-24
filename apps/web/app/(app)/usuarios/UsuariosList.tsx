"use client";

import { useState } from "react";
import { LAB_TIMEZONE } from "@labo/lib/fecha";
import { Ban, Loader2, Mail, RotateCcw, Send, Shield, ShieldCheck, X } from "lucide-react";

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

import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";

export interface UsuarioItem {
  id: string;
  email: string;
  nombre: string;
  role: "admin" | "operador";
  activo: boolean;
  created_at: string;
}

export interface InvitacionItem {
  id: string;
  email: string;
  role: "admin" | "operador";
  expires_at: string;
}

interface UsuariosListProps {
  currentUserId: string;
  initialUsuarios: UsuarioItem[];
  initialInvitaciones: InvitacionItem[];
}

const ROLE_LABEL = { admin: "Administrador", operador: "Operador" } as const;

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: LAB_TIMEZONE,
  });
}

export function UsuariosList({
  currentUserId,
  initialUsuarios,
  initialInvitaciones,
}: UsuariosListProps) {
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>(initialUsuarios);
  const [invitaciones, setInvitaciones] = useState<InvitacionItem[]>(initialInvitaciones);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const res = await fetch("/api/usuarios", { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo cargar la lista de usuarios.");
    const data = (await res.json()) as { usuarios: UsuarioItem[] };
    setUsuarios(data.usuarios);
  }

  async function refreshInvitaciones(): Promise<void> {
    const res = await fetch("/api/usuarios/invite", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { invitations?: InvitacionItem[] };
    setInvitaciones(data.invitations ?? []);
  }

  const handleReenviar = async (inv: InvitacionItem) => {
    setBusyId(inv.id);
    try {
      const res = await fetch("/api/usuarios/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inv.email, role: inv.role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo reenviar la invitación.");
      notifySuccess(`Invitación reenviada a ${inv.email}.`);
      await refreshInvitaciones();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleRevocar = async (inv: InvitacionItem) => {
    if (!window.confirm(`¿Revocar la invitación de ${inv.email}? El enlace dejará de funcionar.`)) return;
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/usuarios/invite/${inv.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo revocar la invitación.");
      notifySuccess("Invitación revocada.");
      setInvitaciones((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (err) {
      notifyError(err);
    } finally {
      setBusyId(null);
    }
  };

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
    try {
      await patchUsuario(usuario.id, { role });
      await refresh();
      notifySuccess(`${usuario.nombre} ahora es ${ROLE_LABEL[role]}.`);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActivo = async (usuario: UsuarioItem) => {
    setBusyId(usuario.id);
    try {
      await patchUsuario(usuario.id, { activo: !usuario.activo });
      await refresh();
      notifySuccess(`${usuario.nombre} fue ${usuario.activo ? "desactivado" : "reactivado"}.`);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <InviteUserDialog onInvited={refreshInvitaciones} />
      </div>

      <Card className="shadow-none">
        <CardContent className="p-0">
          {usuarios.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Todavía no hay usuarios. Invita al primero para empezar.
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

      <section aria-labelledby="invitaciones-titulo" className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <h2 id="invitaciones-titulo" className="text-sm font-semibold text-foreground">
            Invitaciones pendientes
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {invitaciones.length}
          </span>
        </div>
        {invitaciones.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
            No hay invitaciones pendientes. Las que envíes aparecen aquí hasta que se acepten o venzan.
          </p>
        ) : (
          <Card className="shadow-none">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {invitaciones.map((inv) => {
                  const isBusy = busyId === inv.id;
                  return (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-xs"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {inv.email}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {ROLE_LABEL[inv.role]}
                      </span>
                      <span className="text-muted-foreground">
                        Vence el{" "}
                        <span className="font-mono tabular-nums">{formatFecha(inv.expires_at)}</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={isBusy}
                          onClick={() => void handleReenviar(inv)}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Reenviar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                          disabled={isBusy}
                          onClick={() => void handleRevocar(inv)}
                        >
                          <X className="h-3 w-3" />
                          Revocar
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
