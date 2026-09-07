/**
 * Reconstrucción de las líneas de un presupuesto guardado al abrirlo para
 * editar (F7.2.T5).
 *
 * El formulario guarda por línea `paquete_id`, `precio_base_snap` y
 * `ganancia_pct`, pero la pantalla de edición las reconstruía perdiendo esos
 * tres datos: las líneas de un paquete cerrado volvían como sueltas y, al
 * guardar de nuevo, recibían otra vez la ganancia global sobre el precio ya
 * repartido — el mismo cobro de más que F7.2.T4 vino a arreglar.
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
}

/** Campos de pricing que el formulario necesita reconstruir. */
export interface LineaPresupuestoReconstruida {
  paquete_id: string | null;
  precio_base_snap: number;
  /** Valor del input de ganancia por línea; vacío significa "usar la global". */
  gananciaPctInput: string;
  cerrado: boolean;
}

/**
 * ¿La línea viene de un paquete cargado en modo cerrado?
 *
 * Un paquete cerrado se guarda con `ganancia_pct: 0` explícito en cada línea,
 * que es lo que mantiene el total igual al precio pactado. Uno desglosado no
 * manda ganancia por línea, así que hereda la global.
 *
 * Ambigüedad conocida: si la ganancia global es 0, las líneas de un paquete
 * DESGLOSADO también quedan en 0 y se clasifican como cerradas. El total no
 * cambia (0 explícito y 0 heredado dan lo mismo), pero la tabla las muestra
 * como "Paquete cerrado" y quitar una quita el paquete entero. Se prefiere ese
 * error al inverso: clasificar como desglosada una línea cerrada vuelve a
 * cobrar de más, que es el bug que esto cierra.
 */
export function esPaqueteCerrado(linea: LineaPresupuestoGuardada): boolean {
  return linea.paquete_id != null && linea.ganancia_pct === 0;
}

/**
 * Valor inicial del input de ganancia por línea.
 *
 * Vacío cuando la línea no tiene ganancia propia o cuando coincide con la
 * global: en ambos casos el formulario no manda nada y el backend aplica la
 * global, así que el total no cambia y el input muestra el placeholder.
 */
export function gananciaPctInicial(
  linea: LineaPresupuestoGuardada,
  gananciaGlobal: number,
): string {
  if (esPaqueteCerrado(linea)) return "0";
  if (linea.ganancia_pct == null) return "";
  if (linea.ganancia_pct === gananciaGlobal) return "";
  return String(linea.ganancia_pct);
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
  gananciaGlobal: number,
): LineaPresupuestoReconstruida {
  return {
    paquete_id: linea.paquete_id ?? null,
    precio_base_snap: linea.precio_base_snap ?? linea.precio_snap,
    gananciaPctInput: gananciaPctInicial(linea, gananciaGlobal),
    cerrado: esPaqueteCerrado(linea),
  };
}
