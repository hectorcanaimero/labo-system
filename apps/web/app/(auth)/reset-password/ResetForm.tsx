"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CODE: "Código incorrecto. Verificá e intentá de nuevo.",
  TOKEN_EXPIRED: "El código expiró. Solicitá uno nuevo.",
  RATE_LIMITED: "Demasiados intentos. Esperá unos minutos.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
  RESET_FAILED: "No se pudo restablecer la contraseña. Intentá de nuevo.",
};

const inputClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">
          Link inválido o expirado. Por favor, solicitá un nuevo link de
          recuperación.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium underline underline-offset-4"
        >
          Solicitar nuevo link
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Ingresá el código de 6 dígitos que enviamos a{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="code" className="text-sm font-medium leading-none">
          Código de verificación
        </label>
        <input
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
          className={`${inputClassName} text-center tracking-[0.5em]`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium leading-none">
          Nueva contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
          placeholder="Mínimo 8 caracteres"
          className={inputClassName}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="confirm" className="text-sm font-medium leading-none">
          Confirmar contraseña
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={submitting}
          placeholder="Repetí la contraseña"
          className={inputClassName}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
        >
          <span
            aria-hidden="true"
            className="block h-2 w-2 shrink-0 rounded-full bg-destructive"
          />
          <span>{error}</span>
        </div>
      ) : null}

      <Button type="submit" disabled={submitting} className="mt-2 w-full">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando…
          </>
        ) : (
          "Guardar contraseña"
        )}
      </Button>

      <Link
        href="/forgot-password"
        className="text-center text-sm text-muted-foreground underline underline-offset-4"
      >
        No recibí el código — reenviar
      </Link>
    </form>
  );
}
