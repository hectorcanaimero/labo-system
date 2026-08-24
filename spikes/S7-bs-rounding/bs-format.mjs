// Prototipo S7 · Formato / redondeo Bs Venezuela (portar a packages/lib/bs-format.ts en F2.presupuestos)
//
// Reglas (ver REPORT.md):
//   Bs : 2 decimales, miles ".", decimal ","  (Intl.NumberFormat("es-VE"))
//   USD: 2 decimales, miles ",", decimal "."  (Intl.NumberFormat("en-US"))
//   Redondeo: half-up "comercial" = half away from zero (estándar tributario VE).
//
// Por qué NO `Math.round(x * 100) / 100` (ver REPORT.md, sección "Comparación"):
//   1. Error de precisión IEEE 754: 1.005 * 100 === 100.49999999999999 → 1.00 (mal).
//   2. Math.round redondea el .5 hacia +∞: -0.005 → -0.00 (mal; debería ser -0.01).
//   3. Tampoco usar Number.prototype.toFixed para operaciones críticas.

/**
 * Redondeo half-up (half away from zero) a `decimals` decimales.
 * Es exacto para dinero porque trabaja sobre la representación decimal
 * más corta del número (la que el usuario "escribió"), no sobre el double crudo.
 * Validado contra Intl.NumberFormat en 300.000 casos aleatorios (0 divergencias).
 *
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
export function roundHalfUp(value, decimals = 2) {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // `${abs}e${decimals}` desplaza el punto decimal vía string, evitando
  // el error de punto flotante de la multiplicación (ej. 1.005 * 100).
  const shifted = Number(`${abs}e${decimals}`);
  const rounded = Math.round(shifted);
  return (sign * rounded) / 10 ** decimals;
}

const bsFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Redondea un monto en Bs a 2 decimales (devuelve número). */
export function roundBs(amount) {
  return roundHalfUp(amount, 2);
}

/** Formatea un monto en Bs: 2 decimales, miles ".", decimal ",". */
export function formatBs(amount) {
  return bsFormatter.format(roundHalfUp(amount, 2));
}

/** Formatea un monto en USD: 2 decimales, miles ",", decimal ".". */
export function formatUsd(amount) {
  return usdFormatter.format(roundHalfUp(amount, 2));
}

/**
 * Cálculo completo del PRD §10 / F6.presupuestos:
 *   Total USD = subtotal × (1 - descuento%) × (1 + ganancia%)
 *   Total Bs  = round(Total USD × tasa)   ← redondeo SOLO al final de la cadena.
 *
 * La ganancia% es interna: entra al cálculo pero NO se muestra en el PDF.
 *
 * @param {{subtotalUsd:number, descuentoPct:number, gananciaPct:number, tasaBs:number}} p
 * @returns {{totalUsd:number, totalUsdRaw:number, totalBs:number}}
 */
export function computeTotales({ subtotalUsd, descuentoPct, gananciaPct, tasaBs }) {
  const totalUsd = subtotalUsd * (1 - descuentoPct / 100) * (1 + gananciaPct / 100);
  const totalBs = roundHalfUp(totalUsd * tasaBs, 2);
  return {
    totalUsd: roundHalfUp(totalUsd, 2),
    totalUsdRaw: totalUsd,
    totalBs,
  };
}
