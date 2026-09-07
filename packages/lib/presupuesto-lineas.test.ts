import { describe, expect, it } from "vitest";

import {
  esPaqueteCerrado,
  gananciaGlobalGuardada,
  gananciaPctInicial,
  reconstruirLineaGuardada,
} from "./presupuesto-lineas";

describe("esPaqueteCerrado", () => {
  it("reconoce una línea de paquete cerrado por el flag persistido", () => {
    expect(
      esPaqueteCerrado({ paquete_id: "paq1", precio_snap: 10, ganancia_pct: 10, cerrado: true }),
    ).toBe(true);
  });

  it("una línea de paquete desglosado no es cerrada aunque tenga paquete_id", () => {
    expect(
      esPaqueteCerrado({ paquete_id: "paq1", precio_snap: 10, ganancia_pct: 10, cerrado: false }),
    ).toBe(false);
  });

  it("una línea suelta con ganancia 0 no es un paquete cerrado", () => {
    expect(
      esPaqueteCerrado({ paquete_id: null, precio_snap: 10, ganancia_pct: 0, cerrado: false }),
    ).toBe(false);
  });

  it("sin el flag guardado no es cerrada (default false de la 0020)", () => {
    expect(esPaqueteCerrado({ paquete_id: "paq1", precio_snap: 10 })).toBe(false);
  });

  it("F7.2.T6: una línea cerrada con la ganancia global ya resuelta (no 0) sigue siendo cerrada", () => {
    // Antes de F7.2.T6 esto se detectaba por ganancia_pct === 0; ahora una
    // línea cerrada guarda la ganancia global REALMENTE aplicada (acá 10,
    // no 0) para que el total cuadre si se recalcula, y el flag es lo único
    // que importa.
    expect(
      esPaqueteCerrado({ paquete_id: "paq1", precio_snap: 10, ganancia_pct: 10, cerrado: true }),
    ).toBe(true);
  });
});

describe("gananciaPctInicial", () => {
  it("una línea de paquete cerrado no tiene input propio (vacío)", () => {
    expect(
      gananciaPctInicial({ paquete_id: "paq1", precio_snap: 9, ganancia_pct: 10, cerrado: true }),
    ).toBe("");
  });

  it("conserva la ganancia propia de una línea abierta", () => {
    expect(gananciaPctInicial({ precio_snap: 10, ganancia_pct: 25, cerrado: false })).toBe("25");
  });

  it("una línea abierta con ganancia 0 muestra 0, no vacío", () => {
    expect(gananciaPctInicial({ precio_snap: 10, ganancia_pct: 0, cerrado: false })).toBe("0");
  });
});

describe("gananciaGlobalGuardada", () => {
  it("toma la ganancia de la primera línea cerrada", () => {
    expect(
      gananciaGlobalGuardada([
        { paquete_id: "paq1", precio_snap: 9, ganancia_pct: 10, cerrado: true },
        { paquete_id: "paq1", precio_snap: 6, ganancia_pct: 10, cerrado: true },
      ]),
    ).toBe(10);
  });

  it("null cuando no hay ninguna línea cerrada (modo abierto puro)", () => {
    expect(
      gananciaGlobalGuardada([
        { paquete_id: null, precio_snap: 10, ganancia_pct: 25, cerrado: false },
      ]),
    ).toBeNull();
  });

  it("mixto: sólo mira las cerradas, ignora las sueltas", () => {
    expect(
      gananciaGlobalGuardada([
        { paquete_id: "paq1", precio_snap: 9, ganancia_pct: 10, cerrado: true },
        { paquete_id: null, precio_snap: 5, ganancia_pct: 30, cerrado: false },
      ]),
    ).toBe(10);
  });
});

describe("reconstruirLineaGuardada", () => {
  // El caso que rompía (F7.2.T5): paquete cerrado de precio base 15
  // repartido en 9 + 6, con ganancia global 10. Al reeditar, las líneas
  // volvían como sueltas y con el precio de catálogo, así que al guardar el
  // total cambiaba.
  it("una línea de paquete cerrado vuelve cerrada, con su reparto y sin input propio", () => {
    expect(
      reconstruirLineaGuardada({
        paquete_id: "paq1",
        precio_snap: 12,
        precio_base_snap: 9,
        ganancia_pct: 10,
        cerrado: true,
      }),
    ).toEqual({
      paquete_id: "paq1",
      precio_base_snap: 9,
      gananciaPctInput: "",
      cerrado: true,
    });
  });

  it("no cae al precio de catálogo cuando hay reparto guardado", () => {
    const linea = {
      paquete_id: "paq1",
      precio_snap: 12,
      precio_base_snap: 9,
      ganancia_pct: 10,
      cerrado: true,
    };
    expect(reconstruirLineaGuardada(linea).precio_base_snap).toBe(9);
    expect(reconstruirLineaGuardada(linea).precio_base_snap).not.toBe(linea.precio_snap);
  });

  it("cae a precio_snap sólo si el backend no mandó precio_base_snap", () => {
    expect(reconstruirLineaGuardada({ precio_snap: 12 }).precio_base_snap).toBe(12);
  });

  it("conserva la ganancia por línea de una línea suelta", () => {
    expect(
      reconstruirLineaGuardada({ precio_snap: 10, ganancia_pct: 25, cerrado: false }),
    ).toEqual({
      paquete_id: null,
      precio_base_snap: 10,
      gananciaPctInput: "25",
      cerrado: false,
    });
  });

  it("un paquete desglosado se reconstruye editable, con su propia ganancia", () => {
    expect(
      reconstruirLineaGuardada({
        paquete_id: "paq1",
        precio_snap: 12,
        precio_base_snap: 12,
        ganancia_pct: 10,
        cerrado: false,
      }),
    ).toEqual({
      paquete_id: "paq1",
      precio_base_snap: 12,
      gananciaPctInput: "10",
      cerrado: false,
    });
  });
});
