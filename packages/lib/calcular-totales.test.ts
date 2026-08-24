import { describe, expect, it } from "vitest";
import { calcularTotales } from "./calcular-totales";

describe("calcularTotales", () => {
  it("250.00, -10%, +20%, tasa 60.5 → USD 270.00, Bs 16.335,00", () => {
    expect(calcularTotales({ subtotal: 250, descuentoPct: 10, gananciaPct: 20, tasa: 60.5 })).toEqual({
      totalUsd: 270,
      totalBs: 16335,
    });
  });

  it("redondea SOLO al final de la cadena (123.45, -5%, +15%, tasa 62.37)", () => {
    expect(calcularTotales({ subtotal: 123.45, descuentoPct: 5, gananciaPct: 15, tasa: 62.37 })).toEqual({
      totalUsd: 134.87,
      totalBs: 8411.79,
    });
  });

  it("descuento 0% y ganancia 0% → total Bs = subtotal × tasa", () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: 0, gananciaPct: 0, tasa: 50 })).toEqual({
      totalUsd: 100,
      totalBs: 5000,
    });
  });

  it("descuento 100% → totalUsd 0 y totalBs 0", () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: 100, gananciaPct: 0, tasa: 50 })).toEqual({
      totalUsd: 0,
      totalBs: 0,
    });
  });

  it("descuento 100% con ganancia → sigue siendo 0 (multiplicado por 0)", () => {
    expect(calcularTotales({ subtotal: 250, descuentoPct: 100, gananciaPct: 30, tasa: 60.5 })).toEqual({
      totalUsd: 0,
      totalBs: 0,
    });
  });

  it("ganancia interna aplica al total USD y NO se expone por separado", () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: 0, gananciaPct: 30, tasa: 50 })).toEqual({
      totalUsd: 130,
      totalBs: 6500,
    });
  });

  it("descuento negativo (recargo) aumenta el total", () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: -10, gananciaPct: 0, tasa: 50 })).toEqual({
      totalUsd: 110,
      totalBs: 5500,
    });
  });

  it("subtotal negativo se propaga correctamente", () => {
    expect(calcularTotales({ subtotal: -50, descuentoPct: 0, gananciaPct: 0, tasa: 60 })).toEqual({
      totalUsd: -50,
      totalBs: -3000,
    });
  });

  it("subtotal 0 con ganancia 0 → totales 0", () => {
    expect(calcularTotales({ subtotal: 0, descuentoPct: 15, gananciaPct: 20, tasa: 60.5 })).toEqual({
      totalUsd: 0,
      totalBs: 0,
    });
  });

  it("tasa 0 → totalBs 0 aunque haya totalUsd", () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: 0, gananciaPct: 0, tasa: 0 })).toEqual({
      totalUsd: 100,
      totalBs: 0,
    });
  });

  it("redondea totalBs con half-up (subtotal 0.01, tasa 0.005)", () => {
    expect(calcularTotales({ subtotal: 0.01, descuentoPct: 0, gananciaPct: 0, tasa: 0.005 })).toEqual({
      totalUsd: 0.01,
      totalBs: 0,
    });
  });
});
