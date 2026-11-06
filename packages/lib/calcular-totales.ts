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
}

export interface CalcularTotalesLineaResult {
  precioBase: number;
  gananciaPct: number;
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
  return roundHalfUp(value, 2) * 100;
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
  const rawLineTotals = lineas.map((linea) => {
    const precioBase = linePrice(linea);
    const gain = lineGain(linea, gananciaPct);
    return {
      precioBase,
      gananciaPct: gain,
      rawFinal: precioBase * (1 + gain / 100) * discountFactor,
    };
  });

  // El total se redondea una sola vez sobre la suma exacta y se reparte en
  // centavos por mayor resto. Antes el centavo de diferencia del redondeo
  // independiente iba a la última línea, que si valía ~0 (Frotis $0.01)
  // quedaba negativa y violaba presupuestos_examenes_precio_final_snap_check.
  const expectedCents = cents(rawLineTotals.reduce((sum, linea) => sum + linea.rawFinal, 0));
  const finalesCents = repartirCentavos(
    rawLineTotals.map((linea) => linea.rawFinal * 100),
    expectedCents,
  );
  const lineasFinales = rawLineTotals.map((linea, i) => ({
    precioBase: linea.precioBase,
    gananciaPct: linea.gananciaPct,
    precioFinal: finalesCents[i]! / 100,
  }));

  return lineasFinales;
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
