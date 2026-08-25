"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

import {
  isUnauthorizedError,
  toHumanError,
} from "@labo/lib/error-messages";

export interface AppErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary raíz de la sección `(app)` (F4.hardening.T02).
 *
 * - Excepción no capturada → "Algo salió mal" + botón de reset.
 * - Error de sesión (401) → redirige a `/login`.
 * - El mensaje se humaniza con `@labo/lib/error-messages`.
 *
 * Los boundaries por módulo (un `error.tsx` por segmento) re-exportan
 * este componente.
 */
export default function AppErrorBoundary({
  error,
  reset,
}: AppErrorBoundaryProps) {
  useEffect(() => {
    if (isUnauthorizedError(error)) {
      window.location.assign("/login");
    }
  }, [error]);

  const message = toHumanError(error);

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          aria-hidden="true"
        >
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Algo salió mal</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Intentar de nuevo
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Ir al inicio
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-muted-foreground/70">
            Código de referencia: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
