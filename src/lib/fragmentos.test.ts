import { describe, expect, it } from "vitest";

import { MIN_FRAGMENT_CHARS, splitIntoFragments, splitLongText } from "./fragmentos";

const page = (n: number, chars: number) => `P${n} `.repeat(Math.ceil(chars / 4)).slice(0, chars);

describe("splitLongText", () => {
  it("no pierde ni añade caracteres", () => {
    const text = "Primera oración. Segunda oración.\n\nOtro párrafo con más texto. ".repeat(40);
    const parts = splitLongText(text, 300);
    expect(parts.join("")).toBe(text);
    expect(parts.every((p) => p.length <= 300)).toBe(true);
  });

  it("corta aunque no haya espacios", () => {
    const text = "x".repeat(1000);
    const parts = splitLongText(text, 300);
    expect(parts.join("")).toBe(text);
    expect(parts.map((p) => p.length)).toEqual([300, 300, 300, 100]);
  });
});

describe("splitIntoFragments", () => {
  it("devuelve un solo fragmento idéntico al texto completo cuando cabe", () => {
    const pages = ["uno", "dos", "tres"];
    const fragments = splitIntoFragments(pages, 24000);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]).toMatchObject({ index: 1, firstPage: 1, lastPage: 3 });
    expect(fragments[0]!.text).toBe(
      "--- Página 1 ---\nuno\n\n--- Página 2 ---\ndos\n\n--- Página 3 ---\ntres",
    );
  });

  it("cubre todas las páginas, en orden y sin partir ninguna", () => {
    const pages = Array.from({ length: 25 }, (_, i) => page(i + 1, 3900));
    const fragments = splitIntoFragments(pages, 24000);

    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.every((f) => f.text.length <= 24000)).toBe(true);
    expect(fragments.map((f) => f.index)).toEqual(fragments.map((_, i) => i + 1));
    expect(fragments[0]!.firstPage).toBe(1);
    expect(fragments[fragments.length - 1]!.lastPage).toBe(25);
    fragments.slice(1).forEach((f, i) => expect(f.firstPage).toBe(fragments[i]!.lastPage + 1));

    // Cada página aparece completa en exactamente un fragmento.
    pages.forEach((text, i) => {
      const block = `--- Página ${i + 1} ---\n${text}`;
      expect(fragments.filter((f) => f.text.includes(block))).toHaveLength(1);
    });
  });

  it("parte en trozos una página que por sí sola excede el límite", () => {
    const long = "Oración de relleno número uno. ".repeat(400); // ~12,400 caracteres
    const fragments = splitIntoFragments(["corta", long, "final"], 5000);

    expect(fragments.every((f) => f.text.length <= 5000)).toBe(true);
    const all = fragments.map((f) => f.text).join("\n\n");
    expect(all).toContain("--- Página 2 (parte 1) ---");
    expect(all).toContain("--- Página 1 ---\ncorta");
    expect(all).toContain("--- Página 3 ---\nfinal");

    // Reunir las partes de la página 2 devuelve su texto original.
    const rebuilt = all
      .split(/\n\n(?=--- Página )/)
      .filter((b) => b.startsWith("--- Página 2 (parte"))
      .map((b) => b.slice(b.indexOf("\n") + 1))
      .join("");
    expect(rebuilt).toBe(long);
  });

  it("aplica un mínimo cuando el límite configurado es demasiado bajo", () => {
    const pages = Array.from({ length: 4 }, (_, i) => page(i + 1, 900));
    const fragments = splitIntoFragments(pages, 10);
    expect(fragments.every((f) => f.text.length <= MIN_FRAGMENT_CHARS)).toBe(true);
    expect(fragments.length).toBe(2);
  });

  it("devuelve un fragmento vacío para un documento sin páginas", () => {
    expect(splitIntoFragments([], 24000)).toEqual([
      { index: 1, firstPage: 0, lastPage: 0, text: "" },
    ]);
  });
});
