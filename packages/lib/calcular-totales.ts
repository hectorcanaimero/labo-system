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

  const lineasFinales = rawLineTotals.map((linea) => ({
    precioBase: linea.precioBase,
    gananciaPct: linea.gananciaPct,
    precioFinal: roundHalfUp(linea.rawFinal, 2),
  }));

  // El total se redondea una sola vez sobre la suma exacta. El centavo de
  // diferencia que puede producir el redondeo independiente de cada línea se
  // asigna a la última línea, evitando que UI/PDF difieran del encabezado.
  const expectedCents = cents(rawLineTotals.reduce((sum, linea) => sum + linea.rawFinal, 0));
  const actualCents = lineasFinales.reduce((sum, linea) => sum + cents(linea.precioFinal), 0);
  const adjustment = expectedCents - actualCents;
  if (adjustment !== 0 && lineasFinales.length > 0) {
    const last = lineasFinales.length - 1;
    lineasFinales[last] = {
      ...lineasFinales[last],
      precioFinal: (cents(lineasFinales[last].precioFinal) + adjustment) / 100,
    };
  }

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
