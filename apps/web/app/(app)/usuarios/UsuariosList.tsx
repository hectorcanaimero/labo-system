"use client";

import { useState } from "react";
import { Ban, Loader2, RotateCcw, Shield, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-6">
      <InviteUserDialog
        onSuccess={(msg) => {
          setError(null);
          setNotice(msg);
        }}
        onError={(msg) => setError(msg)}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-green-600/20 bg-green-600/10 px-3 py-2 text-sm text-green-700">
          {notice}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight">
            Usuarios registrados ({usuarios.length})
          </h2>
        </div>

        {usuarios.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Todavía no hay usuarios. Invitá al primero para empezar.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {usuarios.map((usuario) => {
              const isSelf = usuario.id === currentUserId;
              const isBusy = busyId === usuario.id;

              return (
                <li
                  key={usuario.id}
                  className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {usuario.nombre}
                      </span>
                      {isSelf ? (
                        <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          Vos
                        </span>
                      ) : null}
                      {!usuario.activo ? (
                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                          Inactivo
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {usuario.email}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Alta: {formatFecha(usuario.created_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      {usuario.role === "admin" ? (
                        <ShieldCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <Shield className="h-4 w-4 text-muted-foreground" />
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
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="admin">Administrador</option>
                        <option value="operador">Operador</option>
                      </select>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSelf || isBusy}
                      onClick={() => void handleToggleActivo(usuario)}
                    >
                      {isBusy ? (
                        <Loader2 className="animate-spin" />
                      ) : usuario.activo ? (
                        <Ban />
                      ) : (
                        <RotateCcw />
                      )}
                      {usuario.activo ? "Desactivar" : "Reactivar"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
