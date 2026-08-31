"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CODE: "Código incorrecto. Verificá e intentá de nuevo.",
  TOKEN_EXPIRED: "El código expiró. Solicitá uno nuevo.",
  RATE_LIMITED: "Demasiados intentos. Esperá unos minutos.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
  RESET_FAILED: "No se pudo restablecer la contraseña. Intentá de nuevo.",
};

interface Props {
  email: string;
}

export function ResetForm({ email }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!email) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs text-muted-foreground">
          Link inválido o expirado. Solicitá un nuevo código de recuperación.
        </p>
        <Link
          href="/forgot-password"
          className="text-xs font-medium underline underline-offset-4 hover:text-foreground"
        >
          Solicitar nuevo código
        </Link>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code.trim())) {
      setError("Ingresá el código de 6 dígitos que recibiste por email.");
      return;
    }
    if (password.length < 8) {
      setError(ERROR_MESSAGES.PASSWORD_TOO_SHORT);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code: code.trim(), password }),
        cache: "no-store",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const codeError = body.error ?? "RESET_FAILED";
        setError(ERROR_MESSAGES[codeError] ?? ERROR_MESSAGES.RESET_FAILED);
        return;
      }

      router.replace("/?reset=ok");
    } catch {
      setError(ERROR_MESSAGES.RESET_FAILED);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <p className="text-xs text-muted-foreground">
        Ingresá el código de 6 dígitos que enviamos a{" "}
        <span className="font-mono tabular-nums text-foreground">{email}</span>.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code" className="text-xs">
          Código
        </Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/[^\d]/g, "").slice(0, 6))
          }
          disabled={submitting}
          placeholder="123456"
          className="h-9 text-center font-mono text-lg tracking-[0.4em] tabular-nums"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-xs">
          Nueva contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
          placeholder="Mínimo 8 caracteres"
          className="h-9 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm" className="text-xs">
          Confirmar contraseña
        </Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={submitting}
          placeholder="Repetí la contraseña"
          className="h-9 text-sm"
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {error}
        </div>
      ) : null}

      <Button type="submit" size="sm" disabled={submitting} className="mt-1 h-9 w-full">
        {submitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Guardando…
          </>
        ) : (
          "Guardar contraseña"
        )}
      </Button>

      <Link
        href="/forgot-password"
        className="text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        No recibí el código — reenviar
      </Link>
    </form>
  );
}
