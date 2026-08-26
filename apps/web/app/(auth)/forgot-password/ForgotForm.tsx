"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError("Ingresá un email válido.");
      return;
    }

    setSubmitting(true);
    try {
      // Respuesta ignorada intencionalmente — siempre mostramos confirmación
      // para no revelar si el email existe (anti-enumeración, spec F0.2.T6).
      await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
        cache: "no-store",
      });
      setSent(true);
    } catch {
      // Error de red: igual mostramos confirmación para no revelar información.
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <MailCheck className="h-10 w-10 text-primary" />
        <p className="text-sm text-muted-foreground">
          Si ese email está registrado, vas a recibir un link para restablecer
          tu contraseña. Revisá también la carpeta de spam.
        </p>
        <Link
          href="/"
          className="text-sm font-medium underline underline-offset-4"
        >
          Volver al login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium leading-none">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
          placeholder="nombre@laboratorio.com"
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
            Enviando…
          </>
        ) : (
          "Enviar link de recuperación"
        )}
      </Button>

      <Link
        href="/"
        className="text-center text-sm text-muted-foreground underline underline-offset-4"
      >
        Volver al login
      </Link>
    </form>
  );
}
