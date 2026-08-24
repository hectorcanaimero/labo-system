import { describe, expect, it } from "vitest";
import { highlight } from "./highlight";

describe("highlight", () => {
  it("returns correct parts for basic match", () => {
    const { parts } = highlight("Hemograma", "hemo");
    expect(parts).toEqual([
      { text: "Hemo", match: true },
      { text: "grama", match: false },
    ]);
  });

  it("is case-insensitive", () => {
    const { parts } = highlight("HEMOGRAMA", "hemo");
    expect(parts).toEqual([
      { text: "HEMO", match: true },
      { text: "GRAMA", match: false },
    ]);
  });

  it("returns text unchanged when term is empty", () => {
    const { parts } = highlight("Hemograma", "");
    expect(parts).toEqual([{ text: "Hemograma", match: false }]);
  });

  it("returns text unchanged when text is empty", () => {
    const { parts } = highlight("", "hemo");
    expect(parts).toEqual([{ text: "", match: false }]);
  });

  it("highlights multiple occurrences", () => {
    const { parts } = highlight("hola hola chau", "hola");
    expect(parts).toEqual([
      { text: "hola", match: true },
      { text: " ", match: false },
      { text: "hola", match: true },
      { text: " chau", match: false },
    ]);
  });

  it("returns no match parts when term not found", () => {
    const { parts } = highlight("Hemograma", "xyz");
    expect(parts).toEqual([{ text: "Hemograma", match: false }]);
  });

  it("handles regex special characters in term", () => {
    const { parts } = highlight("price is $10.00", "$10.00");
    expect(parts).toEqual([
      { text: "price is ", match: false },
      { text: "$10.00", match: true },
    ]);
  });

  it("handles term longer than text", () => {
    const { parts } = highlight("hi", "this is longer");
    expect(parts).toEqual([{ text: "hi", match: false }]);
  });
});
