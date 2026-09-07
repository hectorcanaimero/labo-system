import { describe, expect, it } from "vitest";

import {
  esPaqueteCerrado,
  gananciaPctInicial,
  reconstruirLineaGuardada,
} from "./presupuesto-lineas";

describe("esPaqueteCerrado", () => {
  it("reconoce una línea de paquete cerrado por su ganancia 0 explícita", () => {
    expect(esPaqueteCerrado({ paquete_id: "paq1", precio_snap: 10, ganancia_pct: 0 })).toBe(true);
  });

  it("una línea de paquete desglosado hereda la global y no es cerrada", () => {
    expect(esPaqueteCerrado({ paquete_id: "paq1", precio_snap: 10, ganancia_pct: 10 })).toBe(false);
  });

  it("una línea suelta con ganancia 0 no es un paquete cerrado", () => {
    expect(esPaqueteCerrado({ paquete_id: null, precio_snap: 10, ganancia_pct: 0 })).toBe(false);
  });

  it("sin ganancia guardada no es cerrada", () => {
    expect(esPaqueteCerrado({ paquete_id: "paq1", precio_snap: 10 })).toBe(false);
  });
});

describe("gananciaPctInicial", () => {
  it("una línea de paquete cerrado arranca en 0, no en vacío", () => {
    expect(gananciaPctInicial({ paquete_id: "paq1", precio_snap: 9, ganancia_pct: 0 }, 10)).toBe("0");
  });

  it("conserva la ganancia propia de la línea", () => {
    expect(gananciaPctInicial({ precio_snap: 10, ganancia_pct: 25 }, 10)).toBe("25");
  });

  it("queda vacía si coincide con la global o si no hay", () => {
    expect(gananciaPctInicial({ precio_snap: 10, ganancia_pct: 10 }, 10)).toBe("");
    expect(gananciaPctInicial({ precio_snap: 10 }, 10)).toBe("");
  });
});

describe("reconstruirLineaGuardada", () => {
  // El caso que rompía: paquete cerrado de precio base 15 repartido en 9 + 6,
  // con ganancia global 10. Al reeditar, las líneas volvían como sueltas, sin
  // ganancia 0 y con el precio de catálogo, así que al guardar el total pasaba
  // de 15 a 16,50.
  it("una línea de paquete cerrado vuelve cerrada, con su reparto y ganancia 0", () => {
    expect(
      reconstruirLineaGuardada(
        { paquete_id: "paq1", precio_snap: 12, precio_base_snap: 9, ganancia_pct: 0 },
        10,
      ),
    ).toEqual({
      paquete_id: "paq1",
      precio_base_snap: 9,
      gananciaPctInput: "0",
      cerrado: true,
    });
  });

  it("no cae al precio de catálogo cuando hay reparto guardado", () => {
    const linea = { paquete_id: "paq1", precio_snap: 12, precio_base_snap: 9, ganancia_pct: 0 };
    expect(reconstruirLineaGuardada(linea, 10).precio_base_snap).toBe(9);
    expect(reconstruirLineaGuardada(linea, 10).precio_base_snap).not.toBe(linea.precio_snap);
  });

  it("cae a precio_snap sólo si el backend no mandó precio_base_snap", () => {
    expect(reconstruirLineaGuardada({ precio_snap: 12 }, 0).precio_base_snap).toBe(12);
  });

  it("conserva la ganancia por línea de una línea suelta", () => {
    expect(reconstruirLineaGuardada({ precio_snap: 10, ganancia_pct: 25 }, 10)).toEqual({
      paquete_id: null,
      precio_base_snap: 10,
      gananciaPctInput: "25",
      cerrado: false,
    });
  });

  it("un paquete desglosado se reconstruye editable y sin ganancia propia", () => {
    expect(
      reconstruirLineaGuardada(
        { paquete_id: "paq1", precio_snap: 12, precio_base_snap: 12, ganancia_pct: 10 },
        10,
      ),
    ).toEqual({
      paquete_id: "paq1",
      precio_base_snap: 12,
      gananciaPctInput: "",
      cerrado: false,
    });
  });
});
