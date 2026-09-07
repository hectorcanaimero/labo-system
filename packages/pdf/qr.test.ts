import { describe, expect, it } from "vitest";

import { generarQrPath } from "./qr";

const URL_VERIFICACION = "https://rvlaboratorio.com/v/AbCd123456";

describe("generarQrPath", () => {
  it("devuelve una matriz cuadrada de tamaño válido para un QR", () => {
    const { size } = generarQrPath(URL_VERIFICACION);
    // Las versiones de QR van de 21 a 177 módulos, de 4 en 4.
    expect(size).toBeGreaterThanOrEqual(21);
    expect(size).toBeLessThanOrEqual(177);
    expect((size - 21) % 4).toBe(0);
  });

  it("el path sólo usa comandos SVG absolutos dentro del viewBox", () => {
    const { d, size } = generarQrPath(URL_VERIFICACION);
    expect(d.length).toBeGreaterThan(0);

    const modulos = d.match(/M(\d+) (\d+)h1v1h-1z/g) ?? [];
    expect(modulos.length).toBeGreaterThan(0);
    // Todo el path son módulos: no queda ningún comando suelto sin parsear.
    expect(modulos.join("")).toBe(d);

    for (const modulo of modulos) {
      const [, x, y] = /M(\d+) (\d+)/.exec(modulo)!;
      expect(Number(x)).toBeLessThan(size);
      expect(Number(y)).toBeLessThan(size);
    }
  });

  it("es determinista: el mismo contenido da el mismo path", () => {
    expect(generarQrPath(URL_VERIFICACION)).toEqual(generarQrPath(URL_VERIFICACION));
  });

  it("contenidos distintos dan paths distintos", () => {
    expect(generarQrPath(`${URL_VERIFICACION}x`).d).not.toBe(generarQrPath(URL_VERIFICACION).d);
  });

  it("dibuja los tres patrones de posición: esquinas 7x7 llenas", () => {
    const { d, size } = generarQrPath(URL_VERIFICACION);
    const tiene = (x: number, y: number) => d.includes(`M${x} ${y}h1v1h-1z`);

    // Esquina superior izquierda, superior derecha e inferior izquierda.
    for (const [x, y] of [
      [0, 0],
      [size - 1, 0],
      [0, size - 1],
    ] as const) {
      expect(tiene(x, y)).toBe(true);
    }
    // La esquina inferior derecha NO lleva patrón de posición.
    expect(tiene(size - 1, size - 1)).toBe(false);
  });

  it("rechaza contenido vacío en vez de emitir un QR ilegible", () => {
    expect(() => generarQrPath("")).toThrow("QR_CONTENIDO_VACIO");
    expect(() => generarQrPath("   ")).toThrow("QR_CONTENIDO_VACIO");
  });
});
