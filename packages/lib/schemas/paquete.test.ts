import { describe, expect, it } from "vitest";

import { paqueteCreate, paqueteUpdate } from "./paquete";

describe("paquete precio_base", () => {
  it("acepta un precio base no negativo al crear", () => {
    expect(
      paqueteCreate.safeParse({ nombre: "Perfil básico", precio_base: 25.5 }).success,
    ).toBe(true);
  });

  it("rechaza un precio base negativo al crear", () => {
    expect(
      paqueteCreate.safeParse({ nombre: "Perfil básico", precio_base: -1 }).success,
    ).toBe(false);
  });

  it("rechaza un precio base negativo al actualizar", () => {
    expect(paqueteUpdate.safeParse({ precio_base: -1 }).success).toBe(false);
  });
});
