import { describe, expect, it } from "vitest";

import {
  ENTREGA_REQUIERE_VALORES,
  assertPuedeEntregarse,
  indicesSinValor,
  mensajeSinValor,
  nombresSinValor,
  puedeEntregarse,
  tieneValor,
} from "./entrega-orden";

const ok = (nombre: string, valor = "5.4") => ({ nombre_snap: nombre, valor });
const vacio = (nombre: string, valor: string | null | undefined = "") => ({ nombre_snap: nombre, valor });

describe("tieneValor", () => {
  it("acepta cualquier texto no vacío, incluso '0' o 'Negativo'", () => {
    expect(tieneValor("0")).toBe(true);
    expect(tieneValor("Negativo")).toBe(true);
    expect(tieneValor(" 12 ")).toBe(true);
  });

  it("rechaza vacío, espacios, null y undefined", () => {
    expect(tieneValor("")).toBe(false);
    expect(tieneValor("   ")).toBe(false);
    expect(tieneValor(null)).toBe(false);
    expect(tieneValor(undefined)).toBe(false);
  });
});

describe("indicesSinValor / nombresSinValor", () => {
  it("devuelve los índices y nombres de las líneas vacías en orden", () => {
    const lineas = [ok("Glicemia"), vacio("Urea"), ok("Creatinina"), vacio("VDRL", "  ")];
    expect(indicesSinValor(lineas)).toEqual([1, 3]);
    expect(nombresSinValor(lineas)).toEqual(["Urea", "VDRL"]);
  });

  it("usa 'Examen N' cuando la línea no tiene nombre", () => {
    expect(nombresSinValor([{ valor: "" }, { valor: "1" }, { valor: null, nombre_snap: " " }])).toEqual([
      "Examen 1",
      "Examen 3",
    ]);
  });
});

describe("puedeEntregarse / assertPuedeEntregarse", () => {
  it("permite entregar sólo con todas las líneas cargadas", () => {
    expect(puedeEntregarse([ok("A"), ok("B")])).toBe(true);
    expect(() => assertPuedeEntregarse([ok("A"), ok("B")])).not.toThrow();
  });

  it("bloquea con al menos una línea vacía", () => {
    expect(puedeEntregarse([ok("A"), vacio("B")])).toBe(false);
    expect(() => assertPuedeEntregarse([ok("A"), vacio("B")])).toThrow(ENTREGA_REQUIERE_VALORES);
  });

  it("bloquea una orden sin exámenes", () => {
    expect(puedeEntregarse([])).toBe(false);
    expect(() => assertPuedeEntregarse([])).toThrow(ENTREGA_REQUIERE_VALORES);
  });
});

describe("mensajeSinValor", () => {
  it("nombra lo que falta, en singular y plural", () => {
    expect(mensajeSinValor([ok("A"), vacio("Urea")])).toBe(
      "Falta el valor de Urea. No se puede entregar un resultado incompleto.",
    );
    expect(mensajeSinValor([vacio("Urea"), vacio("VDRL")])).toBe(
      "Faltan los valores de Urea, VDRL. No se puede entregar un resultado incompleto.",
    );
  });

  it("resume cuando faltan más de tres", () => {
    const lineas = [vacio("A"), vacio("B"), vacio("C"), vacio("D"), vacio("E")];
    expect(mensajeSinValor(lineas)).toBe(
      "Faltan los valores de A, B, C y 2 más. No se puede entregar un resultado incompleto.",
    );
  });

  it("devuelve vacío si no falta nada y un aviso si no hay exámenes", () => {
    expect(mensajeSinValor([ok("A")])).toBe("");
    expect(mensajeSinValor([])).toBe("La orden no tiene exámenes: no hay nada que entregar.");
  });
});
