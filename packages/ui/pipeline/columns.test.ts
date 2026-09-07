import { describe, expect, it } from "vitest";

import {
  buildColumns,
  initialCollapsed,
  moveTargets,
  type PipelineColumnDef,
} from "./columns";

type Estado = "Borrador" | "Enviado" | "Aprobado" | "Cerrado" | "Rechazado" | "Cancelado";

const DEFS: PipelineColumnDef<Estado>[] = [
  { estado: "Borrador", accentClassName: "a" },
  { estado: "Enviado", accentClassName: "b" },
  { estado: "Aprobado", accentClassName: "c" },
  { estado: "Cerrado", accentClassName: "d" },
  { estado: "Rechazado", accentClassName: "e", terminal: true },
  { estado: "Cancelado", accentClassName: "f", terminal: true },
];

const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  Borrador: ["Enviado", "Aprobado", "Cancelado"],
  Enviado: ["Aprobado", "Rechazado", "Cancelado"],
  Aprobado: ["Cerrado", "Cancelado"],
  Rechazado: ["Borrador", "Cancelado"],
  Cancelado: [],
  Cerrado: [],
};

interface Card {
  id: string;
  estado: Estado;
}

const card = (id: string, estado: Estado): Card => ({ id, estado });

describe("buildColumns", () => {
  it("mantiene el orden del proceso y manda las terminales al final", () => {
    const columnas = buildColumns(DEFS, []);
    // De esto depende que el tablero se lea como un flujo: si el orden se
    // reordenara por conteo o alfabéticamente, dejaría de contar una historia.
    expect(columnas.map((c) => c.estado)).toEqual([
      "Borrador",
      "Enviado",
      "Aprobado",
      "Cerrado",
      "Rechazado",
      "Cancelado",
    ]);
  });

  it("respeta el orden declarado aunque las terminales vengan mezcladas", () => {
    const mezcladas: PipelineColumnDef<Estado>[] = [
      { estado: "Rechazado", accentClassName: "e", terminal: true },
      { estado: "Borrador", accentClassName: "a" },
      { estado: "Cancelado", accentClassName: "f", terminal: true },
      { estado: "Enviado", accentClassName: "b" },
    ];
    expect(buildColumns(mezcladas, []).map((c) => c.estado)).toEqual([
      "Borrador",
      "Enviado",
      "Rechazado",
      "Cancelado",
    ]);
  });

  it("reparte cada tarjeta en su columna y cuenta", () => {
    const columnas = buildColumns(DEFS, [
      card("1", "Borrador"),
      card("2", "Enviado"),
      card("3", "Borrador"),
      card("4", "Cancelado"),
    ]);
    const porEstado = new Map(columnas.map((c) => [c.estado, c]));
    expect(porEstado.get("Borrador")?.cards.map((c) => c.id)).toEqual(["1", "3"]);
    expect(porEstado.get("Borrador")?.count).toBe(2);
    expect(porEstado.get("Enviado")?.count).toBe(1);
    expect(porEstado.get("Cancelado")?.count).toBe(1);
    expect(porEstado.get("Aprobado")?.count).toBe(0);
  });

  it("conserva el orden de entrada de las tarjetas dentro de la columna", () => {
    // La lista viene ordenada del server; reordenar acá cambiaría el criterio
    // sin que nadie lo pidiera.
    const columnas = buildColumns(DEFS, [
      card("z", "Borrador"),
      card("a", "Borrador"),
      card("m", "Borrador"),
    ]);
    expect(columnas[0].cards.map((c) => c.id)).toEqual(["z", "a", "m"]);
  });

  it("ignora tarjetas de un estado que no es columna, sin romperse", () => {
    const columnas = buildColumns(DEFS, [
      card("1", "Borrador"),
      { id: "raro", estado: "Inexistente" as Estado },
    ]);
    expect(columnas.reduce((n, c) => n + c.count, 0)).toBe(1);
  });
});

describe("moveTargets", () => {
  it("da sólo los destinos permitidos por las transiciones", () => {
    expect(moveTargets(DEFS, "Enviado", TRANSICIONES)).toEqual([
      "Aprobado",
      "Rechazado",
      "Cancelado",
    ]);
  });

  it("los devuelve en el orden de las columnas, no en el de las transiciones", () => {
    // "Cancelado" está declarado antes que "Rechazado" en las transiciones de
    // Borrador; el menú tiene que seguir el orden del tablero.
    expect(moveTargets(DEFS, "Borrador", TRANSICIONES)).toEqual([
      "Enviado",
      "Aprobado",
      "Cancelado",
    ]);
  });

  it("nunca ofrece el estado actual", () => {
    const conAutoTransicion = { ...TRANSICIONES, Aprobado: ["Aprobado", "Cerrado"] as const };
    expect(moveTargets(DEFS, "Aprobado", conAutoTransicion)).toEqual(["Cerrado"]);
  });

  it("un estado terminal no ofrece destinos", () => {
    expect(moveTargets(DEFS, "Cancelado", TRANSICIONES)).toEqual([]);
    expect(moveTargets(DEFS, "Cerrado", TRANSICIONES)).toEqual([]);
  });

  it("descarta destinos que el tablero no muestra", () => {
    // Mover a una columna inexistente haría desaparecer la tarjeta de la
    // vista aunque el backend aceptara la transición.
    const sinCancelado = DEFS.filter((d) => d.estado !== "Cancelado");
    expect(moveTargets(sinCancelado, "Borrador", TRANSICIONES)).toEqual([
      "Enviado",
      "Aprobado",
    ]);
  });
});

describe("initialCollapsed", () => {
  it("arranca con las terminales colapsadas y ninguna más", () => {
    expect(initialCollapsed(DEFS)).toEqual(new Set(["Rechazado", "Cancelado"]));
  });

  it("sin terminales no colapsa nada", () => {
    expect(initialCollapsed(DEFS.filter((d) => !d.terminal))).toEqual(new Set());
  });
});
