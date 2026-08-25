'use client';

import { useEffect, useState } from 'react';

type ClassValue = string | false | null | undefined;

function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(' ');
}

/**
 * Respuesta de `GET /api/tasa/latest` (F1.1.T3 / F3.3.T4).
 * `scraped_at` llega como ISO string (NextResponse.json serializa Date).
 */
interface LatestTasa {
  tasa: number;
  fuente: 'bcv' | 'dolartoday' | 'manual';
  scraped_at: string;
  stale: boolean;
}

interface StaleTasaBadgeProps {
  /** Clases extra aplicadas al badge. */
  className?: string;
  /** Inyectable en tests; por defecto usa `fetch` global. */
  fetcher?: typeof fetch;
  /** Refresco del endpoint (SWR-lite). Default: 5 minutos. */
  refreshIntervalMs?: number;
}

const DEFAULT_REFRESH_MS = 5 * 60 * 1000;
const ENDPOINT = '/api/tasa/latest';
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Horas enteras (mínimo 1) transcurridas desde `scrapedAt` hasta ahora.
 * Se usa para el tooltip "Última: X horas atrás".
 */
export function horasDesde(scrapedAt: string, now: number = Date.now()): number {
  const diffMs = now - new Date(scrapedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 1;
  return Math.max(1, Math.round(diffMs / MS_PER_HOUR));
}

/**
 * F3.3.T4 — Badge de estado de la tasa BCV (ADR-07 banner amarillo).
 *
 * - `stale === true` (> 24h) → badge amarillo con tooltip "Última: X horas atrás".
 * - Sin tasa registrada (`null`) → badge rojo "Sin tasa registrada".
 * - Tasa vigente, loading o error de red → no renderiza nada (evita parpadeo).
 *
 * Consume `GET /api/tasa/latest` con refresco cada 5 minutos. Pensado para
 * `/presupuestos/*` (form nuevo presupuesto F2.4.T6).
 */
export function StaleTasaBadge({
  className,
  fetcher = fetch,
  refreshIntervalMs = DEFAULT_REFRESH_MS,
}: StaleTasaBadgeProps) {
  const [latest, setLatest] = useState<LatestTasa | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetcher(ENDPOINT, { cache: 'no-store' });
        if (!res.ok) throw new Error(`TASA_LATEST_${res.status}`);
        const payload = (await res.json()) as LatestTasa | null;
        if (!cancelled) setLatest(payload);
      } catch {
        if (!cancelled) setLatest(undefined);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), refreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetcher, refreshIntervalMs]);

  if (latest === undefined) return null;

  if (latest === null) {
    return (
      <span
        role="status"
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800',
          className,
        )}
      >
        Sin tasa registrada
      </span>
    );
  }

  if (!latest.stale) return null;

  const horas = horasDesde(latest.scraped_at);
  const tooltip = `Última: ${horas} horas atrás`;

  return (
    <span
      role="status"
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800',
        className,
      )}
    >
      Tasa desactualizada
    </span>
  );
}
