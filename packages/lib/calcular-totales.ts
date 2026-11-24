import { roundHalfUp } from './bs-format';

export interface CalcularTotalesLineaInput {
  /** Precio de catálogo o precio base del paquete, en USD. */
  precioBase?: number;
  /** Alias de payload persistido para facilitar el uso con filas SQL/Zod. */
  precio_base_snap?: number;
  /** Ganancia específica de la línea; si falta se usa la ganancia global. */
  gananciaPct?: number;
  /** Alias de payload persistido para facilitar el uso con filas SQL/Zod. */
  ganancia_pct?: number;
  /**
   * Bloque de precio: las líneas con la misma clave (un paquete cerrado, un
   * grupo) reparten sus centavos entre sí para que el bloque sume exacto.
   * Sin clave, la línea se redondea sola: misma base y mismo % → mismo precio.
   */
  bloque?: string | null;
  /** Veces que se cotiza la línea (presupuestos para empresas). Default 1. */
  cantidad?: number;
}

export interface CalcularTotalesLineaResult {
  precioBase: number;
  gananciaPct: number;
  /** Precio final de la línea: unitario × cantidad. */
  precioFinal: number;
}

export interface CalcularTotalesInput {
  /** API histórica: subtotal calculado por quien llama. */
  subtotal?: number;
  /** API nueva: líneas cuyos precios finales deben sumar exactamente el total. */
  lineas?: CalcularTotalesLineaInput[];
  descuentoPct: number;
  gananciaPct: number;
  tasa: number;
  /**
   * Cargos por servicio en USD (toma de muestra + domicilio). Se suman al total
   * DESPUÉS del descuento y la ganancia: no son mercadería sobre la que el
   * laboratorio marque margen, ni entran en el descuento comercial.
   *
   * No afectan `lineas`: los precios finales por línea siguen sumando el total
   * de exámenes, sin los servicios.
   */
  serviciosUsd?: number;
}

export interface CalcularTotalesResult {
  /** Total a cobrar: exámenes con descuento y ganancia, más los servicios. */
  totalUsd: number;
  totalBs: number;
  /**
   * Precios finales por línea. Suman el total de EXÁMENES, no `totalUsd`:
   * cuando hay `serviciosUsd` la diferencia es exactamente ese monto.
   */
  lineas?: CalcularTotalesLineaResult[];
}

function cents(value: number): number {
  return Math.round(roundHalfUp(value, 2) * 100);
}

/**
 * Reparte `totalCents` en enteros proporcionales a `exactas` (en centavos)
 * por el método del mayor resto: se trunca cada parte y los centavos que
 * faltan van a las de mayor fracción. Suma exacta y, con `exactas` >= 0,
 * nunca negativo.
 */
export function repartirCentavos(exactas: number[], totalCents: number): number[] {
  // El epsilon evita que 6.9999999 (error de float) trunque a 6.
  const partes = exactas.map((v) => Math.max(0, Math.floor(v + 1e-9)));
  let sobrante = totalCents - partes.reduce((sum, c) => sum + c, 0);
  const orden = exactas
    .map((v, i) => ({ i, resto: v - Math.floor(v + 1e-9) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; sobrante > 0 && orden.length > 0; k = (k + 1) % orden.length, sobrante--) {
    partes[orden[k]!.i]! += 1;
  }
  return partes;
}

function linePrice(linea: CalcularTotalesLineaInput): number {
  const precioBase = linea.precioBase ?? linea.precio_base_snap;
  if (precioBase === undefined) {
    throw new Error('PRECIO_BASE_REQUERIDO');
  }
  return precioBase;
}

function lineGain(linea: CalcularTotalesLineaInput, globalGain: number): number {
  return linea.gananciaPct ?? linea.ganancia_pct ?? globalGain;
}

function calculateLineTotals(
  lineas: CalcularTotalesLineaInput[],
  descuentoPct: number,
  gananciaPct: number
): CalcularTotalesLineaResult[] {
  const discountFactor = 1 - descuentoPct / 100;
  const raw = lineas.map((linea) => {
    const precioBase = linePrice(linea);
    const gain = lineGain(linea, gananciaPct);
    return { precioBase, gananciaPct: gain, unitario: precioBase * (1 + gain / 100) * discountFactor };
  });

  // Cada línea suelta se redondea sola (half-up): antes se redondeaba el total
  // y el centavo sobrante caía en UNA línea, así que dos exámenes con la misma
  // base y el mismo % salían distintos (Urea 3.11 vs Creatinina 3.10). Sólo
  // dentro de un bloque (paquete cerrado, grupo) se reparten los centavos por
  // mayor resto, para que el bloque sume exacto sin dejar líneas negativas.
  const bloques = new Map<string, number[]>();
  lineas.forEach((linea, i) => {
    const clave = linea.bloque ?? `#${i}`;
    bloques.set(clave, [...(bloques.get(clave) ?? []), i]);
  });
  const unitCents: number[] = [];
  for (const indices of bloques.values()) {
    const partes = repartirCentavos(
      indices.map((i) => raw[i]!.unitario * 100),
      cents(indices.reduce((sum, i) => sum + raw[i]!.unitario, 0)),
    );
    indices.forEach((i, k) => (unitCents[i] = partes[k]!));
  }

  return raw.map((linea, i) => ({
    precioBase: linea.precioBase,
    gananciaPct: linea.gananciaPct,
    precioFinal: (unitCents[i]! * (lineas[i]!.cantidad ?? 1)) / 100,
  }));
}

export function calcularTotales({
  subtotal,
  lineas,
  descuentoPct,
  gananciaPct,
  tasa,
  serviciosUsd = 0,
}: CalcularTotalesInput): CalcularTotalesResult {
  if (serviciosUsd < 0 || !Number.isFinite(serviciosUsd)) {
    throw new Error('SERVICIO_INVALIDO');
  }
  const servicios = roundHalfUp(serviciosUsd, 2);

  if (lineas) {
    const lineasFinales = calculateLineTotals(lineas, descuentoPct, gananciaPct);
    const totalExamenesUsd = roundHalfUp(
      lineasFinales.reduce((sum, linea) => sum + linea.precioFinal, 0),
      2
    );
    const totalUsd = roundHalfUp(totalExamenesUsd + servicios, 2);

    return {
      totalUsd,
      totalBs: roundHalfUp(totalUsd * tasa, 2),
      lineas: lineasFinales,
    };
  }

  if (subtotal === undefined) {
    throw new Error('SUBTOTAL_O_LINEAS_REQUERIDO');
  }

  const totalExamenesRaw = subtotal * (1 - descuentoPct / 100) * (1 + gananciaPct / 100);
  const totalUsdRaw = totalExamenesRaw + servicios;

  return {
    totalUsd: roundHalfUp(totalUsdRaw, 2),
    totalBs: roundHalfUp(totalUsdRaw * tasa, 2),
  };
}
