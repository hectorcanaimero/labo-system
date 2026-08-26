import { describe, expect, it } from "vitest";

import { configUpdatePartialSchema, configUpdateSchema, RIF_INVALIDO } from "./config";

const base = { nombre: "RV Laboratorio", direccion: "Puerto Ordaz" };

describe("config RIF", () => {
  it.each(["V-14794920-8", "J-12345678-9", "G-20000123-4", "P-1234567-8", "E-123456789-0", "C-12345678-9"])(
    "acepta %s",
    (rif) => expect(configUpdateSchema.safeParse({ ...base, rif }).success).toBe(true),
  );

  it.each(["A-12345678-9", "J-123456-9", "J-1234567890-9", "J-12345678"]) (
    "rechaza %s",
    (rif) => {
      const result = configUpdateSchema.safeParse({ ...base, rif });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(RIF_INVALIDO);
    },
  );
});

describe("campos institucionales", () => {
  it("acepta colegio_bioanalistas y mpps en el formulario completo", () => {
    expect(
      configUpdateSchema.parse({
        ...base,
        colegio_bioanalistas: "N° 713",
        mpps: "10738",
      }),
    ).toMatchObject({ colegio_bioanalistas: "N° 713", mpps: "10738" });
  });

  it("acepta los campos institucionales en actualizaciones parciales", () => {
    expect(configUpdatePartialSchema.parse({ mpps: "10738" })).toEqual({ mpps: "10738" });
  });
});
