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

import { repartirCentavos } from "./calcular-totales";

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
  /** % de ganancia: el de la línea, o el de su paquete si es cerrada. */
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
 * Valor inicial del input de ganancia de la línea. La cerrada guarda el % de
 * su paquete (cada paquete cerrado tiene el suyo); la abierta, el propio.
 */
export function gananciaPctInicial(linea: LineaPresupuestoGuardada): string {
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

interface LineaBloque {
  paquete_id?: string | null;
  grupo_snap?: string | null;
  cerrado?: boolean | null;
}

/**
 * Bloque de edición y de precio: un paquete cerrado entero o un grupo (0026)
 * se cotizan como una sola fila; `null` = examen suelto. Es también la clave
 * `bloque` de `calcularTotales`: dentro del bloque se reparten los centavos.
 */
export function claveBloque(linea: LineaBloque): string | null {
  if (linea.cerrado && linea.paquete_id) return `p:${linea.paquete_id}`;
  if (linea.grupo_snap) return `g:${linea.paquete_id ?? ""}:${linea.grupo_snap}`;
  return null;
}

/** Bloque que ve el paciente (PDF, WhatsApp, detalle): todo paquete es una fila. */
export function claveVisible(linea: LineaBloque): string | null {
  return linea.paquete_id ? `p:${linea.paquete_id}` : claveBloque(linea);
}

/**
 * Agrupa líneas CONSECUTIVAS con la misma clave no nula; cada línea sin clave
 * es un bloque propio. Las líneas siguen siendo por examen (la orden y los
 * resultados las necesitan así); esto es sólo cómo se muestran.
 */
export function agruparBloques<T>(lineas: readonly T[], clave: (linea: T) => string | null): T[][] {
  const bloques: T[][] = [];
  let anterior: string | null = null;
  for (const linea of lineas) {
    const actual = clave(linea);
    const ultimo = bloques.at(-1);
    if (actual !== null && actual === anterior && ultimo) ultimo.push(linea);
    else bloques.push([linea]);
    anterior = actual;
  }
  return bloques;
}

/**
 * Nombres que ve el paciente, uno por bloque visible: el del paquete, el del
 * grupo o el del examen, nunca la lista interna. Con cantidad > 1, "(x N)".
 */
export function nombresVisibles(
  lineas: ReadonlyArray<LineaBloque & { nombre_snap: string; cantidad?: number | null }>,
  nombrePaquete: (paqueteId: string) => string | null | undefined,
): string[] {
  return agruparBloques(lineas, claveVisible).map((bloque) => {
    const l = bloque[0]!;
    const nombre =
      (l.paquete_id ? nombrePaquete(l.paquete_id) : null) ?? l.grupo_snap ?? l.nombre_snap;
    const cantidad = l.cantidad ?? 1;
    return cantidad > 1 ? `${nombre} (x${cantidad})` : nombre;
  });
}

/**
 * Reparte el precio de un paquete (o grupo) entre sus exámenes en proporción
 * al catálogo, en centavos y sumando exacto.
 *
 * Método del mayor resto: cada parte se trunca y los centavos sobrantes van a
 * las de mayor fracción. Antes cada parte se redondeaba por separado y la
 * última absorbía el residuo: con varios redondeos hacia arriba y una última
 * línea de precio ~0 (p. ej. Descripción Frotis) quedaba negativa (-0.02) y
 * el guardado fallaba con PRECIO_INVALIDO.
 */
export function distribuirPrecioBase(precioBasePaquete: number, preciosCatalogo: number[]): number[] {
  const n = preciosCatalogo.length;
  if (n === 0) return [];
  const totalCents = Math.round(precioBasePaquete * 100);
  const pesos = preciosCatalogo.map((precio) => Math.max(0, Math.round(precio * 100)));
  const sumaPesos = pesos.reduce((sum, c) => sum + c, 0);
  // Sin precios de catálogo, reparto parejo.
  const exactas = pesos.map((p) => (sumaPesos > 0 ? (totalCents * p) / sumaPesos : totalCents / n));
  const partes = repartirCentavos(exactas, totalCents);
  return partes.map((c) => c / 100);
}
