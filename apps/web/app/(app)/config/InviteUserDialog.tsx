"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Shield, UserPlus, X, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InviteUserDialogProps {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: "admin" | "operador";
  expires_at: string;
}

export function InviteUserDialog({ onSuccess, onError }: InviteUserDialogProps) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "operador">("operador");
  const [submitting, setSubmitting] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Determine if current user is admin; fetch pending invitations if so
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) { setIsAdmin(false); return; }
        const me = await meRes.json() as { role?: string };
        if (cancelled) return;
        if (me.role !== "admin") { setIsAdmin(false); return; }
        setIsAdmin(true);
        await fetchPending();
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchPending() {
    setLoadingPending(true);
    try {
      const res = await fetch("/api/usuarios/invite");
      if (res.ok) {
        const data = await res.json() as { invitations?: PendingInvitation[] };
        setPendingInvitations(data.invitations ?? []);
      }
    } catch {
      // silently ignore — list is best-effort
    } finally {
      setLoadingPending(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      onError("Por favor, ingresá un correo electrónico válido.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/usuarios/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        onError(data.error ?? "Error al enviar la invitación.");
        return;
      }
      onSuccess(`¡Invitación enviada a ${email} como ${role === "admin" ? "Administrador" : "Operador"}!`);
      setEmail("");
      setRole("operador");
      setIsOpen(false);
      await fetchPending();
    } catch {
      onError("Error de red al enviar la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  // Only admins see this component
  if (isAdmin === null) return null;
  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      {/* Pending invitations list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Invitaciones pendientes</span>
          {loadingPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>

        {pendingInvitations.length === 0 && !loadingPending ? (
          <p className="text-xs text-muted-foreground py-2">Sin invitaciones pendientes.</p>
        ) : (
          <ul className="space-y-1.5">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{inv.email}</span>
                  <span className="shrink-0 rounded px-1.5 py-0.5 bg-secondary text-secondary-foreground capitalize">
                    {inv.role}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground ml-2 shrink-0">
                  <Clock className="h-3 w-3" />
                  <span>
                    {new Date(inv.expires_at).toLocaleDateString("es-VE", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2"
      >
        <UserPlus className="h-4 w-4" />
        <span>Invitar usuario</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold leading-none tracking-tight">Invitar Usuario</h3>
                <p className="text-xs text-muted-foreground">
                  Enviá un enlace de acceso por email. Vence en 7 días.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 hover:bg-muted text-muted-foreground/80 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="invite-email" className="text-sm font-medium leading-none">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@laboratorio.com"
                    disabled={submitting}
                    className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="invite-role" className="text-sm font-medium leading-none">
                  Rol de Acceso
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <select
                    id="invite-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as "admin" | "operador")}
                    disabled={submitting}
                    className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="operador">Operador (Ingreso de resultados)</option>
                    <option value="admin">Administrador (Acceso total)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>El invitado elegirá su contraseña al activar su cuenta.</span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando…
                    </>
                  ) : (
                    "Enviar Invitación"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
