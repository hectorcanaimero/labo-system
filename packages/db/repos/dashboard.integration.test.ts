import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closeSql } from "../client.js";
import { getKPIs, getResultadosPorMes, getRecentActivity } from "./dashboard.js";

describe("Dashboard repo (integration)", () => {
  beforeAll(async () => {
    // We expect the seed to have run. We'll just verify the queries don't crash.
  });

  afterAll(async () => {
    await closeSql();
  });

  it("should get KPIs", async () => {
    const kpis = await getKPIs();
    expect(kpis).toHaveProperty("pacientesMes");
    expect(typeof kpis.pacientesMes).toBe("number");
    expect(typeof kpis.resultadosMes).toBe("number");
    expect(typeof kpis.presupuestosMes).toBe("number");
    expect(typeof kpis.ingresosEstimadosUsd).toBe("number");
  });

  it("should get resultados por mes", async () => {
    const res = await getResultadosPorMes(6);
    expect(res).toBeInstanceOf(Array);
    expect(res.length).toBe(6);
    expect(res[0]).toHaveProperty("mes");
    expect(res[0]).toHaveProperty("count");
  });

  it("should get recent activity", async () => {
    const activity = await getRecentActivity(5);
    expect(activity).toHaveProperty("resultados");
    expect(activity).toHaveProperty("presupuestos");
    expect(activity.resultados.length).toBeLessThanOrEqual(5);
    expect(activity.presupuestos.length).toBeLessThanOrEqual(5);
  });
});
