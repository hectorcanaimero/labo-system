import { roundHalfUp } from "./bs-format";

export interface CalcularTotalesInput {
  subtotal: number;
  descuentoPct: number;
  gananciaPct: number;
  tasa: number;
}

export interface CalcularTotalesResult {
  totalUsd: number;
  totalBs: number;
}

export function calcularTotales({
  subtotal,
  descuentoPct,
  gananciaPct,
  tasa,
}: CalcularTotalesInput): CalcularTotalesResult {
  const totalUsdRaw = subtotal * (1 - descuentoPct / 100) * (1 + gananciaPct / 100);

  return {
    totalUsd: roundHalfUp(totalUsdRaw, 2),
    totalBs: roundHalfUp(totalUsdRaw * tasa, 2),
  };
}
