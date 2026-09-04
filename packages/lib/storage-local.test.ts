import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Regresión GUR-16: el upload de logo/firma/sello no funcionaba.
 *
 * Cubre el camino completo que ejercitan los Route Handlers de
 * `/api/config/assets/*` y `/api/storage/[bucket]/[...path]`.
 */

let root: string;
let storage: typeof import("./storage-local");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "labo-storage-"));
  process.env.STORAGE_ROOT = root;
  process.env.STORAGE_SIGNING_SECRET = "x".repeat(32);
  storage = await import("./storage-local");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("storage-local", () => {
  it("guarda, lee y borra un asset", async () => {
    const key = "assets/logo/abc.png";
    const data = Buffer.from("PNG");

    const saved = await storage.saveObject("assets", key, data);
    expect(saved.size).toBe(3);
    expect(await storage.readObject("assets", key)).toEqual(data);

    await storage.deleteObject("assets", key);
    expect(await storage.objectExists("assets", key)).toBeNull();
  });

  it("firma una URL de descarga que el handler puede verificar", () => {
    const key = "assets/firma/abc.png";
    const url = storage.signDownloadUrl({ bucket: "assets", key });

    // El handler reconstruye la key desde el path y valida token+exp.
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe(`/api/storage/assets/${key}`);

    const token = parsed.searchParams.get("token") ?? "";
    const exp = Number(parsed.searchParams.get("exp"));
    expect(storage.verifyDownloadToken("assets", key, token, exp)).toBe(true);
    expect(storage.verifyDownloadToken("assets", key, token, exp - 1)).toBe(false);
    expect(storage.verifyDownloadToken("exports", key, token, exp)).toBe(false);
  });

  it("rechaza path traversal", () => {
    expect(() => storage.resolveObjectPath("assets", "../../etc/passwd")).toThrow();
    expect(() => storage.resolveObjectPath("assets", "/etc/passwd")).toThrow();
  });
});
