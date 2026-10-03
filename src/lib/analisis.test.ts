import { describe, expect, it } from "vitest";

import { AnalysisError, CONSOLIDATION_PROMPT, type ChatFn, analyzeDocument } from "./analisis";
import type { Msg } from "./local-ai";
import { type Project, newProject } from "./store";

const project = (maxChars: number): Project => {
  const p = newProject();
  return { ...p, topic: "Régimen antilavado", llm: { ...p.llm, model: "modelo", maxChars } };
};

const text = (m: Msg) => String(m.content);

/** Modelo simulado: registra cada llamada y responde con lo que indique `reply`. */
function fakeChat(reply: (messages: Msg[], call: number) => string) {
  const calls: Msg[][] = [];
  const chat: ChatFn = async (_ep, messages) => {
    calls.push(messages);
    return { content: reply(messages, calls.length), ms: 100 };
  };
  return { chat, calls };
}

describe("analyzeDocument", () => {
  it("hace una sola llamada, sin nota de fragmento, cuando el documento cabe", async () => {
    const { chat, calls } = fakeChat(() => '{"titulo":"T"}');
    const p = project(24000);

    const res = await analyzeDocument(p, ["uno", "dos"], chat);

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual({ role: "system", content: p.llm.systemPrompt });
    expect(text(calls[0]![1]!)).toBe(
      'Tema del proyecto: Régimen antilavado\n\nVariables a extraer:\n- "titulo" (texto): Título del artículo\n- "autores" (lista): Autores\n- "anio" (número): Año de publicación\n\nTexto del documento:\n--- Página 1 ---\nuno\n\n--- Página 2 ---\ndos',
    );
    expect(res).toMatchObject({ json: { titulo: "T" }, ms: 100, consolidationMs: 0 });
    expect(res.fragments).toHaveLength(1);
  });

  it("envía todas las páginas de un documento largo y consolida los parciales", async () => {
    const pages = Array.from({ length: 25 }, (_, i) => `contenido-${i + 1} `.repeat(300));
    const { chat, calls } = fakeChat((messages, call) =>
      messages[0]!.content === CONSOLIDATION_PROMPT
        ? '{"titulo":"final","relaciones":["a","b"]}'
        : `{"titulo":null,"relaciones":["parcial-${call}"]}`,
    );

    const progress: string[] = [];
    const res = await analyzeDocument(project(24000), pages, chat, (m) => progress.push(m));

    const map = calls.filter((c) => c[0]!.content !== CONSOLIDATION_PROMPT);
    const reduce = calls.filter((c) => c[0]!.content === CONSOLIDATION_PROMPT);
    expect(map.length).toBeGreaterThan(1);
    expect(reduce).toHaveLength(1);

    // Ninguna página se queda sin llegar al modelo.
    const sent = map.map((c) => text(c[1]!)).join("\n");
    pages.forEach((_, i) => expect(sent).toContain(`--- Página ${i + 1} ---\ncontenido-${i + 1} `));
    expect(text(map[1]![1]!)).toContain(`Este texto es el fragmento 2 de ${map.length}`);

    // La consolidación recibe todos los parciales y su resultado es el registro final.
    map.forEach((_, i) => expect(text(reduce[0]![1]!)).toContain(`parcial-${i + 1}`));
    expect(res.json).toEqual({ titulo: "final", relaciones: ["a", "b"] });
    expect(res.fragments).toHaveLength(map.length);
    expect(res.ms).toBe((map.length + 1) * 100);
    expect(res.consolidationMs).toBe(100);
    expect(progress[0]).toContain(`fragmento 1/${map.length}`);
    expect(progress[progress.length - 1]).toContain("consolidando");
  });

  it("consolida por grupos cuando los parciales no caben en una sola llamada", async () => {
    const pages = Array.from({ length: 12 }, (_, i) => `p${i + 1} `.repeat(450)); // ~1,800 c/u
    const big = "r".repeat(900);
    const { chat, calls } = fakeChat((messages) =>
      messages[0]!.content === CONSOLIDATION_PROMPT ? '{"ok":true}' : `{"relaciones":["${big}"]}`,
    );

    const res = await analyzeDocument(project(2000), pages, chat);

    const reduce = calls.filter((c) => c[0]!.content === CONSOLIDATION_PROMPT);
    expect(res.fragments).toHaveLength(12);
    expect(reduce.length).toBeGreaterThan(1);
    expect(res.json).toEqual({ ok: true });
    // La última consolidación reúne resultados que cubren del primer al último fragmento.
    const last = text(reduce[reduce.length - 1]![1]!);
    expect(last).toContain("Fragmentos 1–");
    expect(last).toContain("–12 (");
  });

  it("si falla un fragmento, lo dice y conserva los parciales previos", async () => {
    const pages = Array.from({ length: 10 }, (_, i) => `p${i + 1} `.repeat(1000));
    const { chat } = fakeChat((_m, call) => {
      if (call === 2) throw new Error("Error 500: sin memoria");
      return '{"titulo":"x"}';
    });

    const error = await analyzeDocument(project(8000), pages, chat).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AnalysisError);
    expect((error as AnalysisError).message).toMatch(
      /^Fragmento 2\/\d+ \(páginas? .+\): Error 500/,
    );
    expect((error as AnalysisError).fragments).toHaveLength(1);
  });

  it("conserva el mensaje original cuando falla un documento de un solo fragmento", async () => {
    const { chat } = fakeChat(() => {
      throw new Error("No se pudo conectar.");
    });
    const error = await analyzeDocument(project(24000), ["uno"], chat).catch((e: unknown) => e);
    expect((error as Error).message).toBe("No se pudo conectar.");
  });
});
