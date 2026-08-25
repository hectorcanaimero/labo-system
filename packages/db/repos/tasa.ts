import type { Sql } from "postgres";

import { withTransaction } from "@labo/db/client";

export type TasaFuente = "bcv" | "dolartoday" | "manual";

export interface LatestTasa {
  tasa: number;
  fuente: TasaFuente;
  scraped_at: Date;
  stale: boolean;
}

export interface SetManualTasaInput {
  tasa: number;
  motivo?: string;
  usuarioId: string;
}

interface LatestTasaRow {
  tasa: string | number;
  fuente: TasaFuente;
  scraped_at: Date;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const AUDIT_ACTION = "tasa.setManual";
const ENTITY_TYPE = "tasa_cambio_bcv";

function normalizeTasa(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

/**
 * Retorna el último registro de `tasa_cambio_bcv` (spec F1.1.T3).
 *
 * - `null` si la tabla está vacía.
 * - `stale: true` si la última tasa supera las 24h (THRESHOLD) desde su
 *   `scraped_at` — el frontend muestra el badge "stale" y el form de
 *   presupuestos lo usa como fallback pre-relleno.
 *
 * `tasa` es `numeric(14,4)` en el DDL; postgres.js lo devuelve como string,
 * así que se normaliza a número.
 */
export async function getLatest(sql: Sql): Promise<LatestTasa | null> {
  const rows = await sql<LatestTasaRow[]>`
    SELECT tasa, fuente, scraped_at
    FROM tasa_cambio_bcv
    ORDER BY fecha DESC, scraped_at DESC
    LIMIT 1
  `;

  const latest = rows[0];
  if (!latest) {
    return null;
  }

  return {
    tasa: normalizeTasa(latest.tasa),
    fuente: latest.fuente,
    scraped_at: latest.scraped_at,
    stale: Date.now() - latest.scraped_at.getTime() > STALE_THRESHOLD_MS,
  };
}

/**
 * Override manual de la tasa BCV (spec F1.1.T3 / F2.4.T3).
 *
 * Inserta una fila con `fuente: "manual"` y registra el evento en `audit_log`
 * (accion `tasa.setManual`) para trazabilidad del motivo. Retorna el `id` de
 * la fila creada. El handler `/api/tasa/manual` valida Admin + input y delega
 * acá dentro de una transacción atómica.
 */
export async function setManual(input: SetManualTasaInput): Promise<string> {
  const motivo = input.motivo?.trim();

  return withTransaction(async (tx) => {
    const tasaRows = await tx<{ id: string }[]>`
      INSERT INTO tasa_cambio_bcv (tasa, fecha, fuente, scraped_at, motivo, created_by)
      VALUES (
        ${input.tasa},
        now(),
        ${"manual"},
        now(),
        ${motivo && motivo.length > 0 ? motivo : null},
        ${input.usuarioId}
      )
      RETURNING id
    `;

    const tasaId = tasaRows[0]?.id;
    if (!tasaId) {
      throw new Error("No se pudo crear la tasa manual.");
    }

    await tx`
      INSERT INTO audit_log (usuario_id, accion, entity_type, entity_id, metadata)
      VALUES (
        ${input.usuarioId},
        ${AUDIT_ACTION},
        ${ENTITY_TYPE},
        ${tasaId},
        ${tx.json({ tasa: input.tasa, motivo: motivo ?? null, fuente: "manual" })}
      )
    `;

    return tasaId;
  });
}
