import { describe, it, expect } from "vitest";

import { esCoordenadas, esUbicacionValida, resolverUbicacionMaps } from "./ubicacion";

describe("esCoordenadas", () => {
  it("acepta un par lat,long con signos y decimales", () => {
    expect(esCoordenadas("10.49,-66.88")).toBe(true);
    expect(esCoordenadas("-10.49, -66.88")).toBe(true);
    expect(esCoordenadas("10,-66")).toBe(true);
  });

  it("rechaza texto que no es un par de coordenadas", () => {
    expect(esCoordenadas("https://maps.app.goo.gl/abc")).toBe(false);
    expect(esCoordenadas("cerca del terminal")).toBe(false);
    expect(esCoordenadas("10.49")).toBe(false);
  });
});

describe("esUbicacionValida", () => {
  it("acepta vacío (campo opcional)", () => {
    expect(esUbicacionValida("")).toBe(true);
    expect(esUbicacionValida("   ")).toBe(true);
  });

  it("acepta coordenadas y enlaces http(s)", () => {
    expect(esUbicacionValida("10.49,-66.88")).toBe(true);
    expect(esUbicacionValida("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(esUbicacionValida("http://maps.google.com/?q=1,2")).toBe(true);
  });

  it("rechaza texto libre y protocolos no http", () => {
    expect(esUbicacionValida("cerca del terminal")).toBe(false);
    expect(esUbicacionValida("javascript:alert(1)")).toBe(false);
  });
});

describe("resolverUbicacionMaps", () => {
  it("arma un enlace de Google Maps a partir de coordenadas", () => {
    expect(resolverUbicacionMaps("10.49,-66.88")).toBe(
      "https://www.google.com/maps?q=10.49%2C-66.88",
    );
  });

  it("devuelve el enlace tal cual si ya es http(s)", () => {
    expect(resolverUbicacionMaps("https://maps.app.goo.gl/abc123")).toBe(
      "https://maps.app.goo.gl/abc123",
    );
  });

  it("devuelve null si está vacío o no matchea ningún formato", () => {
    expect(resolverUbicacionMaps("")).toBeNull();
    expect(resolverUbicacionMaps("cerca del terminal")).toBeNull();
  });
});
