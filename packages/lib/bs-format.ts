const BS_FORMATTER = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function roundHalfUp(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;

  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);

  const [mantissa, exp = "0"] = abs.toExponential().split("e");
  const shifted = Number(`${mantissa}e${Number(exp) + decimals}`);
  const rounded = Math.round(shifted);

  return (sign * rounded) / 10 ** decimals;
}

export function roundBs(amount: number): number {
  return roundHalfUp(amount, 2);
}

export function roundUsd(amount: number): number {
  return roundHalfUp(amount, 2);
}

export function formatBs(amount: number): string {
  return BS_FORMATTER.format(roundHalfUp(amount, 2));
}

export function formatUsd(amount: number): string {
  return USD_FORMATTER.format(roundHalfUp(amount, 2));
}
