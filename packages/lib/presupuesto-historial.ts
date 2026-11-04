/**
 * Historial de un presupuesto, reconstruido desde `audit_log`.
 *
 * `create` y `update` guardan en `metadata` una foto compacta (`SnapshotPresupuesto`)
 * del presupuesto después del cambio (`despues`) y, en `update`, también antes
 * (`antes`). Los eventos anteriores a esta función no traen foto: se muestran
 * igual, sólo que sin detalle de qué cambió.
 */

export interface SnapshotLinea {
  nombre: string;
  base: number;
  ganancia_pct: number;
  final: number;
  cerrado: boolean;
  grupo: string | null;
  /** Sin esto el PDF no puede agrupar un paquete. Ausente en fotos viejas. */
  paquete_id?: string | null;
}

export interface SnapshotPresupuesto {
  tasa_bs: number;
  descuento_pct: number;
  ganancia_pct: number;
  toma_muestra_usd: number;
  domicilio_usd: number;
  total_usd: number;
  total_bs: number;
  lineas: SnapshotLinea[];
}

export interface CambioHistorial {
  campo: string;
  antes: string;
  despues: string;
}

const CAMPOS: Array<[keyof Omit<SnapshotPresupuesto, "lineas">, string]> = [
  ["tasa_bs", "Tasa Bs"],
  ["descuento_pct", "Descuento %"],
  ["ganancia_pct", "Ganancia % (paquete)"],
  ["toma_muestra_usd", "Toma de muestra USD"],
  ["domicilio_usd", "Domicilio USD"],
  ["total_usd", "Total USD"],
  ["total_bs", "Total Bs"],
];

const n = (v: number): string => String(Number(v.toFixed(2)));

/**
 * Qué cambió entre dos fotos: campos de cabecera y líneas agregadas, quitadas
 * o con otro precio final. Las líneas se emparejan por nombre (+ grupo).
 */
export function diffSnapshots(
  antes: SnapshotPresupuesto,
  despues: SnapshotPresupuesto,
): CambioHistorial[] {
  const cambios: CambioHistorial[] = [];

  for (const [key, campo] of CAMPOS) {
    if (antes[key] !== despues[key]) {
      cambios.push({ campo, antes: n(antes[key]), despues: n(despues[key]) });
    }
  }

  const clave = (l: SnapshotLinea): string => `${l.grupo ?? ""}\u0000${l.nombre}`;
  const prev = new Map(antes.lineas.map((l) => [clave(l), l]));
  const next = new Map(despues.lineas.map((l) => [clave(l), l]));

  for (const [k, l] of next) {
    const old = prev.get(k);
    if (!old) {
      cambios.push({ campo: `Examen: ${l.nombre}`, antes: "—", despues: `agregado (${n(l.final)})` });
    } else if (old.final !== l.final) {
      cambios.push({ campo: `Examen: ${l.nombre}`, antes: n(old.final), despues: n(l.final) });
    }
  }
  for (const [k, l] of prev) {
    if (!next.has(k)) {
      cambios.push({ campo: `Examen: ${l.nombre}`, antes: n(l.final), despues: "quitado" });
    }
  }

  return cambios;
}

/**
 * Datos para reimprimir una versión anterior: pisa precios, tasa, totales y
 * líneas de `data` con los de la foto. Paciente, número y fecha de emisión
 * siguen siendo los actuales (la foto no los guarda).
 */
export function aplicarVersion<
  T extends {
    tasa_bs: number;
    descuento_pct: number;
    toma_muestra_usd?: number;
    domicilio_usd?: number;
    total_usd: number;
    total_bs: number;
    lineas: unknown[];
  },
>(
  data: T,
  version: SnapshotPresupuesto,
): Omit<T, "lineas"> & {
  lineas: Array<{
    id: string;
    nombre_snap: string;
    precio_final_snap: number;
    orden: number;
    grupo_snap: string | null;
    paquete_id: string | null;
  }>;
} {
  return {
    ...data,
    tasa_bs: version.tasa_bs,
    descuento_pct: version.descuento_pct,
    toma_muestra_usd: version.toma_muestra_usd,
    domicilio_usd: version.domicilio_usd,
    total_usd: version.total_usd,
    total_bs: version.total_bs,
    lineas: version.lineas.map((l, orden) => ({
      id: `v${orden}`,
      nombre_snap: l.nombre,
      precio_final_snap: l.final,
      orden,
      grupo_snap: l.grupo,
      paquete_id: l.paquete_id ?? null,
    })),
  };
}
