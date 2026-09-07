import { describe, it, expect } from "vitest";
import { createAdminClient } from "@insforge/sdk";
import { getKPIs, getResultadosPorMes, getRecentActivity } from "./dashboard.js";
import type { Db } from "../sdk.js";

// Los repos reciben el cliente InsForge (`Db`, PostgREST) inyectado en vez de
// usar `getSql()` internamente. Sin INSFORGE_URL/INSFORGE_API_KEY (caso del CI
// de la raíz) no hay forma de construir uno real, así que la suite se salta.
const INSFORGE_URL = process.env.INSFORGE_URL?.trim();
const INSFORGE_API_KEY = process.env.INSFORGE_API_KEY?.trim();
const describeIfDb = INSFORGE_URL && INSFORGE_API_KEY ? describe : describe.skip;

describeIfDb("Dashboard repo (integration)", () => {
  // `describe.skip` igual ejecuta este cuerpo para armar el árbol de tests,
  // así que la construcción del cliente real debe quedar condicionada:
  // sin envs no hay URL/API key válidas para `createAdminClient`.
  const db: Db =
    INSFORGE_URL && INSFORGE_API_KEY
      ? createAdminClient({
          baseUrl: INSFORGE_URL.replace(/\/+$/, ""),
          apiKey: INSFORGE_API_KEY,
        }).database
      : (undefined as unknown as Db);

  it("should get KPIs", async () => {
    const kpis = await getKPIs(db);
    expect(kpis).toHaveProperty("pacientesMes");
    expect(typeof kpis.pacientesMes).toBe("number");
    expect(typeof kpis.resultadosMes).toBe("number");
    expect(typeof kpis.presupuestosMes).toBe("number");
    expect(typeof kpis.ingresosEstimadosUsd).toBe("number");
  });

  it("should get resultados por mes", async () => {
    const res = await getResultadosPorMes(db, 6);
    expect(res).toBeInstanceOf(Array);
    expect(res.length).toBe(6);
    expect(res[0]).toHaveProperty("mes");
    expect(res[0]).toHaveProperty("count");
  });

  it("should get recent activity", async () => {
    const activity = await getRecentActivity(db, 5);
    expect(activity).toHaveProperty("resultados");
    expect(activity).toHaveProperty("presupuestos");
    expect(activity.resultados.length).toBeLessThanOrEqual(5);
    expect(activity.presupuestos.length).toBeLessThanOrEqual(5);
  });
});
