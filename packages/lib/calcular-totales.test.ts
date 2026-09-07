import { describe, expect, it } from 'vitest';
import { calcularTotales } from './calcular-totales';

describe('calcularTotales', () => {
  it('250.00, -10%, +20%, tasa 60.5 → USD 270.00, Bs 16.335,00', () => {
    expect(
      calcularTotales({ subtotal: 250, descuentoPct: 10, gananciaPct: 20, tasa: 60.5 })
    ).toEqual({
      totalUsd: 270,
      totalBs: 16335,
    });
  });

  it('redondea SOLO al final de la cadena (123.45, -5%, +15%, tasa 62.37)', () => {
    expect(
      calcularTotales({ subtotal: 123.45, descuentoPct: 5, gananciaPct: 15, tasa: 62.37 })
    ).toEqual({
      totalUsd: 134.87,
      totalBs: 8411.79,
    });
  });

  it('descuento 0% y ganancia 0% → total Bs = subtotal × tasa', () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: 0, gananciaPct: 0, tasa: 50 })).toEqual({
      totalUsd: 100,
      totalBs: 5000,
    });
  });

  it('descuento 100% → totalUsd 0 y totalBs 0', () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: 100, gananciaPct: 0, tasa: 50 })).toEqual(
      {
        totalUsd: 0,
        totalBs: 0,
      }
    );
  });

  it('descuento 100% con ganancia → sigue siendo 0 (multiplicado por 0)', () => {
    expect(
      calcularTotales({ subtotal: 250, descuentoPct: 100, gananciaPct: 30, tasa: 60.5 })
    ).toEqual({
      totalUsd: 0,
      totalBs: 0,
    });
  });

  it('ganancia interna aplica al total USD y NO se expone por separado', () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: 0, gananciaPct: 30, tasa: 50 })).toEqual({
      totalUsd: 130,
      totalBs: 6500,
    });
  });

  it('descuento negativo (recargo) aumenta el total', () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: -10, gananciaPct: 0, tasa: 50 })).toEqual(
      {
        totalUsd: 110,
        totalBs: 5500,
      }
    );
  });

  it('subtotal negativo se propaga correctamente', () => {
    expect(calcularTotales({ subtotal: -50, descuentoPct: 0, gananciaPct: 0, tasa: 60 })).toEqual({
      totalUsd: -50,
      totalBs: -3000,
    });
  });

  it('subtotal 0 con ganancia 0 → totales 0', () => {
    expect(calcularTotales({ subtotal: 0, descuentoPct: 15, gananciaPct: 20, tasa: 60.5 })).toEqual(
      {
        totalUsd: 0,
        totalBs: 0,
      }
    );
  });

  it('tasa 0 → totalBs 0 aunque haya totalUsd', () => {
    expect(calcularTotales({ subtotal: 100, descuentoPct: 0, gananciaPct: 0, tasa: 0 })).toEqual({
      totalUsd: 100,
      totalBs: 0,
    });
  });

  it('redondea totalBs con half-up (subtotal 0.01, tasa 0.005)', () => {
    expect(
      calcularTotales({ subtotal: 0.01, descuentoPct: 0, gananciaPct: 0, tasa: 0.005 })
    ).toEqual({
      totalUsd: 0.01,
      totalBs: 0,
    });
  });

  it('calcula la ganancia específica de cada línea', () => {
    const result = calcularTotales({
      lineas: [
        { precioBase: 100, gananciaPct: 10 },
        { precioBase: 50, gananciaPct: 20 },
      ],
      descuentoPct: 0,
      gananciaPct: 0,
      tasa: 40,
    });

    expect(result.lineas?.map((linea) => linea.precioFinal)).toEqual([110, 60]);
    expect(result.totalUsd).toBe(170);
    expect(result.totalBs).toBe(6800);
  });

  it('usa la ganancia global cuando una línea no define una propia', () => {
    const result = calcularTotales({
      lineas: [{ precioBase: 100 }, { precioBase: 50, gananciaPct: 20 }],
      descuentoPct: 0,
      gananciaPct: 10,
      tasa: 1,
    });

    expect(result.lineas?.map((linea) => linea.precioFinal)).toEqual([110, 60]);
    expect(result.totalUsd).toBe(170);
  });

  it('reconcilia al centavo la suma de líneas con el total general', () => {
    const result = calcularTotales({
      lineas: [
        { precioBase: 0.01, gananciaPct: 33.33 },
        { precioBase: 0.01, gananciaPct: 33.33 },
        { precioBase: 0.01, gananciaPct: 33.33 },
      ],
      descuentoPct: 0,
      gananciaPct: 0,
      tasa: 36.5,
    });

    const sumaLineas = result.lineas!.reduce((sum, linea) => sum + linea.precioFinal, 0);
    expect(sumaLineas).toBe(result.totalUsd);
    expect(result.lineas?.map((linea) => linea.precioFinal)).toEqual([0.01, 0.01, 0.02]);
  });

  it('incluye el descuento en los precios finales visibles y mantiene la suma', () => {
    const result = calcularTotales({
      lineas: [{ precioBase: 10 }, { precioBase: 10 }],
      descuentoPct: 15,
      gananciaPct: 0,
      tasa: 2,
    });

    expect(result.lineas?.map((linea) => linea.precioFinal)).toEqual([8.5, 8.5]);
    expect(result.totalUsd).toBe(17);
    expect(result.lineas!.reduce((sum, linea) => sum + linea.precioFinal, 0)).toBe(result.totalUsd);
  });

  it('paquete cerrado con ganancia 0 explícita por línea ignora la ganancia global', () => {
    // F7.2.T4: antes, la ganancia global se aplicaba de nuevo sobre el
    // reparto del precio base del paquete, así que el total del paquete
    // cerrado ya no era el precio pactado. Con ganancia_pct: 0 explícito
    // en cada línea, el total se mantiene igual al precio base del paquete.
    const result = calcularTotales({
      lineas: [
        { precioBase: 9, gananciaPct: 0 },
        { precioBase: 6, gananciaPct: 0 },
      ],
      descuentoPct: 0,
      gananciaPct: 10,
      tasa: 1,
    });

    expect(result.totalUsd).toBe(15);
  });

  it('acepta los nombres snake_case de los snapshots SQL', () => {
    const result = calcularTotales({
      lineas: [{ precio_base_snap: 10, ganancia_pct: 25 }],
      descuentoPct: 0,
      gananciaPct: 0,
      tasa: 2,
    });

    expect(result.lineas?.[0]).toEqual({ precioBase: 10, gananciaPct: 25, precioFinal: 12.5 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F7.2.T2 — cargos por servicio (toma de muestra + domicilio)
  // ───────────────────────────────────────────────────────────────────────────

  it('suma los servicios al total: subtotal 13, ganancia 0, toma 4 + domicilio 6 → 23 USD', () => {
    const result = calcularTotales({
      lineas: [{ precioBase: 8 }, { precioBase: 5 }],
      descuentoPct: 0,
      gananciaPct: 0,
      tasa: 40,
      serviciosUsd: 4 + 6,
    });

    expect(result.totalUsd).toBe(23);
    expect(result.totalBs).toBe(920);
    // Las líneas siguen sumando sólo los exámenes: 13, no 23.
    expect(result.lineas!.reduce((sum, linea) => sum + linea.precioFinal, 0)).toBe(13);
  });

  it('los servicios quedan fuera del descuento y de la ganancia', () => {
    const result = calcularTotales({
      lineas: [{ precioBase: 100 }],
      descuentoPct: 50,
      gananciaPct: 100,
      tasa: 1,
      serviciosUsd: 10,
    });

    // 100 → +100% ganancia = 200 → -50% descuento = 100. Los 10 de servicio
    // se suman enteros: 110, no 100 * 2 * 0.5 + 10 * 2 * 0.5.
    expect(result.totalUsd).toBe(110);
  });

  it('acepta servicios en la API por subtotal', () => {
    expect(
      calcularTotales({ subtotal: 250, descuentoPct: 10, gananciaPct: 20, tasa: 60.5, serviciosUsd: 4 })
    ).toEqual({
      totalUsd: 274,
      totalBs: 16577,
    });
  });

  it('sin servicios el resultado es idéntico a omitir el campo', () => {
    const base = { lineas: [{ precioBase: 10 }], descuentoPct: 0, gananciaPct: 0, tasa: 2 };

    expect(calcularTotales({ ...base, serviciosUsd: 0 })).toEqual(calcularTotales(base));
  });

  it('redondea los servicios a dos decimales antes de sumarlos', () => {
    const result = calcularTotales({
      lineas: [{ precioBase: 10 }],
      descuentoPct: 0,
      gananciaPct: 0,
      tasa: 1,
      serviciosUsd: 4.005,
    });

    expect(result.totalUsd).toBe(14.01);
  });

  it.each([-0.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza servicios inválidos: %p',
    (serviciosUsd) => {
      expect(() =>
        calcularTotales({
          lineas: [{ precioBase: 10 }],
          descuentoPct: 0,
          gananciaPct: 0,
          tasa: 1,
          serviciosUsd,
        })
      ).toThrow('SERVICIO_INVALIDO');
    }
  );
});
