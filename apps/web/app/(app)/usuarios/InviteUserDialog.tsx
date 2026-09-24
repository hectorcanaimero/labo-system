"use client";

import { useState } from "react";
import { Loader2, Mail, Shield, UserPlus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InviteUserDialogProps {
  /** Se llama tras crear la invitación, para refrescar la lista de pendientes. */
  onInvited: () => Promise<void> | void;
}

/** Botón "Invitar usuario" + diálogo. La página ya es solo-admin (server). */
export function InviteUserDialog({ onInvited }: InviteUserDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "operador">("operador");
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next && submitting) return;
    setIsOpen(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/usuarios/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        notifyError(new Error(data.error ?? "No se pudo enviar la invitación."));
        return;
      }
      notifySuccess(`Invitación enviada a ${email.trim()}.`);
      setEmail("");
      setRole("operador");
      setIsOpen(false);
      await onInvited();
    } catch {
      notifyError(new Error("Error de red al enviar la invitación."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setIsOpen(true)} className="gap-2">
        <UserPlus className="h-4 w-4" />
        Invitar usuario
      </Button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-md flex-col gap-0 overflow-hidden p-0 text-card-foreground">
          <DialogHeader className="px-6 pb-4 pr-12 pt-6">
            <DialogTitle>Invitar usuario</DialogTitle>
            <DialogDescription className="text-xs">
              Envía un enlace de acceso por email. Vence en 7 días.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="invite-email" className="text-sm font-medium leading-none">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <input
                    id="invite-email"
                    type="email"
                    required
                    autoFocus
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
                  Rol de acceso
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <select
                    id="invite-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as "admin" | "operador")}
                    disabled={submitting}
                    className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="operador">Operador (ingreso de resultados)</option>
                    <option value="admin">Administrador (acceso total)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>El invitado elegirá su contraseña al activar su cuenta.</span>
              </div>
            </DialogBody>

            <DialogFooter className="shrink-0 gap-3 border-t border-border bg-card px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
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
                  "Enviar invitación"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
