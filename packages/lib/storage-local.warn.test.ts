import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F7.6.T2 — un STORAGE_ROOT sin setear cae al default silenciosamente; el
 * único rastro debería ser un warning en el arranque, no un reporte del
 * cliente semanas después. Separado de storage-local.test.ts porque ese
 * archivo fija STORAGE_ROOT en `beforeAll` y lo importa una sola vez: acá
 * necesitamos el módulo fresco, sin la env seteada, para poder ejercitar
 * la rama del default.
 */

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;

beforeEach(() => {
  vi.resetModules();
  delete process.env.STORAGE_ROOT;
});

afterEach(() => {
  if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT;
  else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
  vi.restoreAllMocks();
});

describe("storage-local — STORAGE_ROOT sin configurar", () => {
  it("avisa por consola la primera vez que se resuelve una key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = await import("./storage-local");

    storage.resolveObjectPath("assets", "assets/logo/x.png");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("STORAGE_ROOT");
  });

  it("no repite el aviso en llamadas subsiguientes del mismo proceso", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = await import("./storage-local");

    storage.resolveObjectPath("assets", "assets/logo/x.png");
    storage.resolveObjectPath("assets", "assets/firma/y.png");
    storage.resolveObjectPath("assets", "assets/sello/z.png");

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
