"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotForm() {
  const router = useRouter();
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
      await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
        cache: "no-store",
      });
      router.replace(`/reset-password?email=${encodeURIComponent(trimmedEmail)}`);
    } catch {
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="h-8 w-8 text-primary" />
        <p className="text-xs text-muted-foreground">
          Si ese email está registrado, vas a recibir un código para restablecer
          tu contraseña. Revisá también la carpeta de spam.
        </p>
        <Link
          href="/"
          className="text-xs font-medium underline underline-offset-4 hover:text-foreground"
        >
          Volver al login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-xs">
          Email
        </Label>
        <Input
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
            Enviando…
          </>
        ) : (
          "Enviar código"
        )}
      </Button>

      <Link
        href="/"
        className="text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Volver al login
      </Link>
    </form>
  );
}
