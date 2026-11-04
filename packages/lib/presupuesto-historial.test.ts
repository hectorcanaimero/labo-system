import { describe, expect, it } from "vitest";

import { aplicarVersion, diffSnapshots, type SnapshotPresupuesto } from "./presupuesto-historial";

const base: SnapshotPresupuesto = {
  tasa_bs: 891.11,
  descuento_pct: 0,
  ganancia_pct: 30,
  toma_muestra_usd: 3,
  domicilio_usd: 5,
  total_usd: 56.75,
  total_bs: 50570.23,
  lineas: [
    { nombre: "Glicemia", base: 5, ganancia_pct: 30, final: 6.5, cerrado: false, grupo: null },
    { nombre: "Urea", base: 5, ganancia_pct: 30, final: 6.5, cerrado: false, grupo: null },
  ],
};

describe("diffSnapshots", () => {
  it("sin cambios devuelve vacío", () => {
    expect(diffSnapshots(base, structuredClone(base))).toEqual([]);
  });

  it("detecta cambio de tasa y totales", () => {
    const despues = { ...base, tasa_bs: 893.22, total_bs: 50690 };
    expect(diffSnapshots(base, despues).map((c) => c.campo)).toEqual(["Tasa Bs", "Total Bs"]);
  });

  it("detecta examen agregado, quitado y con otro precio", () => {
    const despues: SnapshotPresupuesto = {
      ...base,
      lineas: [
        { ...base.lineas[0]!, final: 7 },
        { nombre: "Creatinina", base: 4, ganancia_pct: 30, final: 5.2, cerrado: false, grupo: null },
      ],
    };
    expect(diffSnapshots(base, despues)).toEqual([
      { campo: "Examen: Glicemia", antes: "6.5", despues: "7" },
      { campo: "Examen: Creatinina", antes: "—", despues: "agregado (5.2)" },
      { campo: "Examen: Urea", antes: "6.5", despues: "quitado" },
    ]);
  });
});

describe("aplicarVersion", () => {
  it("pisa precios, tasa, totales y líneas, y deja el resto", () => {
    const actual = {
      numero: "PR-1",
      tasa_bs: 900,
      descuento_pct: 10,
      toma_muestra_usd: 0,
      domicilio_usd: 0,
      total_usd: 99,
      total_bs: 99,
      lineas: [],
    };
    const out = aplicarVersion(actual, {
      ...base,
      lineas: [{ ...base.lineas[0]!, paquete_id: "paq1", grupo: "Hemograma" }],
    });
    expect(out).toMatchObject({
      numero: "PR-1",
      tasa_bs: 891.11,
      descuento_pct: 0,
      total_usd: 56.75,
      total_bs: 50570.23,
      lineas: [
        {
          nombre_snap: "Glicemia",
          precio_final_snap: 6.5,
          orden: 0,
          grupo_snap: "Hemograma",
          paquete_id: "paq1",
        },
      ],
    });
  });
});
