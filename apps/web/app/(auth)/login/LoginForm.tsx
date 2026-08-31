"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_CREDENTIALS = "Credenciales inválidas. Intentá de nuevo.";

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError("Ingresá un email válido.");
      return;
    }
    if (password.length === 0) {
      setError("Ingresá tu contraseña.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError(INVALID_CREDENTIALS);
        setSubmitting(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(INVALID_CREDENTIALS);
      setSubmitting(false);
    }
  };

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-xs">
          Contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
          placeholder="••••••••"
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
            Ingresando…
          </>
        ) : (
          <>
            <LogIn className="h-3.5 w-3.5" />
            Entrar
          </>
        )}
      </Button>

      <Link
        href="/forgot-password"
        className="text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
