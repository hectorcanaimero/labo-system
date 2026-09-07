"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Botón "Sugerir redacción" para el textarea de observaciones (F7.3.T3).
 *
 * Vivía duplicado en `ResultadoForm` (alta/edición) y hacía falta también en
 * el detalle de la orden. `packages/ui` no puede importar `@/lib/api-client`
 * (vive en `apps/web`), así que el manejo de 401/403 se repite acá con
 * `fetch` plano — mismo patrón que `exports/ExportButton.tsx`.
 *
 * No cambia el prompt del endpoint (`/api/ai/observaciones`), sólo dónde se
 * puede disparar.
 */

const AI_ENABLED = process.env.NEXT_PUBLIC_AI_OBSERVACIONES_ENABLED === "true";

interface SugerenciaResponse {
  sugerencia?: string;
  error?: string;
  message?: string;
  retry_after_sec?: number;
}

export interface RefinarObservacionesButtonProps {
  /** Borrador actual del textarea que este botón reescribe. */
  value: string;
  /** Se llama con el texto reescrito; el caller decide cómo guardarlo. */
  onChange: (siguiente: string) => void;
  disabled?: boolean;
  className?: string;
  /** Pista visible cuando no hay error ni sugerencia recién aplicada. */
  hint?: string;
}

export function RefinarObservacionesButton({
  value,
  onChange,
  disabled,
  className,
  hint,
}: RefinarObservacionesButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!AI_ENABLED) return null;

  async function handleClick(): Promise<void> {
    const texto = value.trim();
    if (!texto) {
      setError("Escribe primero un borrador para que el asistente lo mejore.");
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/observaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ texto }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.status === 403) {
        window.location.href = "/dashboard?reason=sin-permisos";
        return;
      }

      const data = (await res.json().catch(() => ({}))) as SugerenciaResponse;
      if (!res.ok || !data.sugerencia) {
        if (res.status === 429) {
          setError(`Demasiadas solicitudes. Intenta nuevamente en ${data.retry_after_sec ?? 30}s.`);
        } else if (data.error === "AI_DISABLED") {
          setError("El asistente está deshabilitado en este entorno.");
        } else {
          setError(data.message ?? "No se pudo generar la sugerencia. Intenta de nuevo.");
        }
        return;
      }
      onChange(data.sugerencia);
      setNotice("Sugerencia aplicada. Revisa y edita antes de guardar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red al contactar el asistente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          void handleClick();
        }}
        disabled={disabled || loading || !value.trim()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        title="Reescribe el borrador en registro técnico venezolano"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {loading ? "Sugiriendo…" : "Sugerir redacción"}
      </button>
      {error ? (
        <p className="mt-1 text-xs font-normal text-destructive">{error}</p>
      ) : notice ? (
        <p className="mt-1 text-xs font-normal text-muted-foreground">{notice}</p>
      ) : hint ? (
        <p className="mt-1 text-xs font-normal text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
