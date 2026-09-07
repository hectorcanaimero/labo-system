import { describe, expect, it } from "vitest";

import { decidirRenovacion, leerExpJwt } from "./sesion-jwt";

function jwt(payload: Record<string, unknown>): string {
  const b64 = (s: string) => Buffer.from(s).toString("base64url");
  return `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify(payload))}.firma`;
}

describe("leerExpJwt", () => {
  it("devuelve exp en milisegundos", () => {
    expect(leerExpJwt(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });
  it("devuelve null sin exp, con exp no numérico o con token roto", () => {
    expect(leerExpJwt(jwt({ sub: "x" }))).toBeNull();
    expect(leerExpJwt(jwt({ exp: "mañana" }))).toBeNull();
    expect(leerExpJwt("no-es-un-jwt")).toBeNull();
    expect(leerExpJwt("a.%%%.c")).toBeNull();
  });
});

describe("decidirRenovacion", () => {
  const ahora = 1_800_000_000_000;
  it("vigente si vence después del margen", () => {
    expect(decidirRenovacion(jwt({ exp: 1_800_000_000 + 3600 }), ahora)).toBe("vigente");
  });
  it("renovar si vence dentro del margen de 5 minutos", () => {
    expect(decidirRenovacion(jwt({ exp: 1_800_000_000 + 120 }), ahora)).toBe("renovar");
  });
  it("renovar si ya venció", () => {
    expect(decidirRenovacion(jwt({ exp: 1_800_000_000 - 10 }), ahora)).toBe("renovar");
  });
  it("sin-exp cuando no se puede leer", () => {
    expect(decidirRenovacion("basura", ahora)).toBe("sin-exp");
  });
  it("respeta un margen distinto", () => {
    expect(decidirRenovacion(jwt({ exp: 1_800_000_000 + 120 }), ahora, 60_000)).toBe("vigente");
  });
});
