/**
 * Reconstrucción de las líneas de un presupuesto guardado al abrirlo para
 * editar (F7.2.T5, F7.2.T6).
 *
 * El formulario guarda por línea `paquete_id`, `precio_base_snap`,
 * `ganancia_pct` y `cerrado`, pero la pantalla de edición las reconstruía
 * perdiendo esos datos: las líneas de un paquete cerrado volvían como
 * sueltas y, al guardar de nuevo, recibían otra vez la ganancia global sobre
 * el precio ya repartido — el mismo cobro de más que F7.2.T4 vino a
 * arreglar.
 *
 * Vive acá, y no en el componente, para poder probarlo: `apps/web` no tiene
 * runner de tests.
 */

/** Línea tal como vuelve del backend (`presupuestos_examenes`). */
export interface LineaPresupuestoGuardada {
  paquete_id?: string | null;
  precio_snap: number;
  precio_base_snap?: number | null;
  ganancia_pct?: number | null;
  /** F7.2.T6 — flag persistido (migración 0020), reemplaza la inferencia
   * por `ganancia_pct === 0` de F7.2.T5. */
  cerrado?: boolean | null;
}

/** Campos de pricing que el formulario necesita reconstruir. */
export interface LineaPresupuestoReconstruida {
  paquete_id: string | null;
  precio_base_snap: number;
  /**
   * Valor del input de ganancia por línea (modo abierto). Para una línea
   * cerrada no importa — la gobierna el campo global, no se muestra ni se
   * edita — pero queda con la ganancia guardada por si algo la lee igual.
   */
  gananciaPctInput: string;
  cerrado: boolean;
}

/**
 * ¿La línea viene de un paquete cargado en modo cerrado?
 *
 * F7.2.T6 — ya no se infiere de `ganancia_pct === 0`: esa inferencia se
 * volvió ambigua en cuanto una línea cerrada empezó a guardar la ganancia
 * global REALMENTE aplicada (no un 0 explícito), para que el total cuadre
 * si se recalcula. `cerrado` es el flag persistido en la migración 0020, sin
 * ambigüedad posible.
 */
export function esPaqueteCerrado(linea: LineaPresupuestoGuardada): boolean {
  return linea.paquete_id != null && linea.cerrado === true;
}

/**
 * Valor inicial del input de ganancia por línea (modo abierto).
 *
 * Una línea cerrada no tiene input propio — se omite en la UI — así que acá
 * sólo importa para líneas abiertas/sueltas: su ganancia siempre viene
 * explícita desde el backend (la columna es NOT NULL), nunca hay que
 * "adivinar" si coincide con alguna global.
 */
export function gananciaPctInicial(linea: LineaPresupuestoGuardada): string {
  if (esPaqueteCerrado(linea)) return "";
  return String(linea.ganancia_pct ?? 0);
}

/**
 * Reconstruye los campos de pricing de una línea guardada.
 *
 * `precio_base_snap` cae a `precio_snap` sólo si el backend no lo mandó; para
 * un paquete cerrado los dos son distintos (el base es el reparto del precio
 * del paquete, el snap es el precio de catálogo), así que el fallback
 * perdería el precio pactado.
 */
export function reconstruirLineaGuardada(
  linea: LineaPresupuestoGuardada,
): LineaPresupuestoReconstruida {
  return {
    paquete_id: linea.paquete_id ?? null,
    precio_base_snap: linea.precio_base_snap ?? linea.precio_snap,
    gananciaPctInput: gananciaPctInicial(linea),
    cerrado: esPaqueteCerrado(linea),
  };
}

/**
 * Ganancia global a precargar en el input del cuadro de descuento/tasa al
 * editar un presupuesto que tiene un paquete cerrado.
 *
 * Todas las líneas cerradas de un mismo presupuesto comparten la misma
 * ganancia (una sola es la que gobierna el paquete), así que alcanza con la
 * primera. `null` cuando no hay ninguna línea cerrada — modo abierto puro,
 * el campo global ni se muestra.
 */
export function gananciaGlobalGuardada(
  lineas: LineaPresupuestoGuardada[],
): number | null {
  const cerrada = lineas.find(esPaqueteCerrado);
  return cerrada ? (cerrada.ganancia_pct ?? 0) : null;
}
