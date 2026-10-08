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

describe("analyzeDocument con libro de códigos", () => {
  const withCodebook = (maxChars: number): Project => ({
    ...project(maxChars),
    categories: [
      {
        name: "sentido",
        description: "Qué afirma el texto.",
        level: "hallazgo",
        multiple: false,
        values: [
          { value: "deficiencia", definition: "una carencia" },
          { value: "avance", definition: "" },
        ],
      },
    ],
  });

  it("envía el esquema, describe las categorías y verifica las citas", async () => {
    const opts: unknown[] = [];
    const chat: ChatFn = async (_ep, _messages, o) => {
      opts.push(o);
      return {
        content: JSON.stringify({
          titulo: "T",
          hallazgos: [
            {
              cita: "la UIF   carece de personal",
              pagina: 1,
              resumen: "r",
              sentido: "deficiencia",
            },
            { cita: "texto inventado", pagina: 2, resumen: "r", sentido: "avance" },
          ],
        }),
        ms: 10,
      };
    };
    const calls: string[] = [];
    const spy: ChatFn = async (ep, m, o) => {
      calls.push(text(m[1]!));
      return chat(ep, m, o);
    };

    const res = await analyzeDocument(
      withCodebook(24000),
      ["La UIF carece de personal.", "otra"],
      spy,
    );

    expect(calls[0]).toContain(
      '- "sentido" (una sola opción): Qué afirma el texto.\n    · "deficiencia": una carencia\n    · "avance"',
    );
    expect(calls[0]).toContain('incluye la clave "hallazgos"');
    expect((opts[0] as { schema: { properties: object } }).schema.properties).toHaveProperty(
      "hallazgos",
    );
    const found = (res.json as { hallazgos: Record<string, unknown>[] }).hallazgos;
    expect(found.map((f) => f["cita_verificada"])).toEqual([true, false]);
    expect(found[0]!["paginas_cita"]).toEqual([1]);
    expect(res.schemaRejected).toBe(false);
  });

  it("une los hallazgos de todos los fragmentos sin pasarlos por la consolidación", async () => {
    const pages = Array.from({ length: 6 }, (_, i) =>
      `Página ${i + 1}: la autoridad ${i + 1} falla. `.repeat(60),
    );
    const { chat, calls } = fakeChat((messages, call) =>
      messages[0]!.content === CONSOLIDATION_PROMPT
        ? '{"titulo":"final","hallazgos":[{"cita":"inventada"}]}'
        : JSON.stringify({
            titulo: null,
            hallazgos: [
              {
                cita: `la autoridad ${call} falla`,
                pagina: call,
                resumen: "r",
                sentido: "deficiencia",
              },
            ],
          }),
    );

    const res = await analyzeDocument(withCodebook(4000), pages, chat);

    const reduce = calls.filter((c) => c[0]!.content === CONSOLIDATION_PROMPT);
    expect(reduce.length).toBeGreaterThan(0);
    reduce.forEach((c) => {
      expect(text(c[1]!)).not.toContain("hallazgos");
      expect(text(c[1]!)).not.toContain("incluye la clave");
    });
    const found = (res.json as { titulo: string; hallazgos: Record<string, unknown>[] }).hallazgos;
    expect((res.json as { titulo: string }).titulo).toBe("final");
    expect(found).toHaveLength(res.fragments.length);
    expect(found.every((f) => f["cita_verificada"] === true)).toBe(true);
  });

  it("no envía esquema si el proyecto lo desactiva", async () => {
    const p = withCodebook(24000);
    p.llm.strictJson = false;
    let sent: unknown = "sin llamar";
    await analyzeDocument(p, ["uno"], async (_ep, _m, o) => {
      sent = o?.schema;
      return { content: "{}", ms: 1 };
    });
    expect(sent).toBeUndefined();
  });

  it("marca el resultado cuando el servidor rechaza el esquema", async () => {
    const res = await analyzeDocument(withCodebook(24000), ["uno"], async () => ({
      content: '{"hallazgos":[]}',
      ms: 1,
      schemaRejected: true,
    }));
    expect(res.schemaRejected).toBe(true);
  });
});

describe("respuestas vacías o truncadas", () => {
  const pages = Array.from({ length: 6 }, (_, i) =>
    `Página ${i + 1}: la autoridad ${i + 1} falla. `.repeat(60),
  );

  it("avisa del fragmento vacío, lo deja fuera de la consolidación y conserva los demás", async () => {
    const consolidated: string[] = [];
    const chat: ChatFn = async (_ep, messages) => {
      if (messages[0]!.content === CONSOLIDATION_PROMPT) {
        consolidated.push(String(messages[1]!.content));
        return { content: '{"titulo":"T"}', ms: 1 };
      }
      const user = String(messages[1]!.content);
      if (user.includes("fragmento 1 de"))
        return { content: "", ms: 1, finishReason: "length", reasoningChars: 9000 };
      return { content: '{"titulo":"T"}', ms: 1, finishReason: "stop" };
    };

    const res = await analyzeDocument(project(4000), pages, chat);

    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toMatch(
      /^Fragmento 1\/\d+ \(páginas? .+\): respuesta vacía: el modelo agotó/,
    );
    expect(res.warnings[0]).toContain("razonó 9,000 caracteres");
    expect(res.fragments[0]!.problem).toBeDefined();
    expect(consolidated.join("\n")).not.toContain("Fragmento 1 (");
    expect(res.json).toEqual({ titulo: "T" });
  });

  it("si la consolidación no devuelve JSON, une los parciales sin el modelo", async () => {
    const chat: ChatFn = async (_ep, messages) => {
      if (messages[0]!.content === CONSOLIDATION_PROMPT)
        return { content: "", ms: 1, finishReason: "length" };
      const n = Number(/fragmento (\d+) de/.exec(String(messages[1]!.content))![1]);
      return {
        content: JSON.stringify({
          titulo: n === 2 ? "Otro" : "Título",
          anio: null,
          autores: [`A${n % 2}`],
          relaciones: [`r${n}`],
        }),
        ms: 1,
      };
    };

    const res = await analyzeDocument(project(4000), pages, chat);

    expect(res.warnings.some((w) => w.startsWith("Consolidación de Fragmentos 1–"))).toBe(true);
    const json = res.json as Record<string, unknown>;
    expect(json["titulo"]).toBe("Título");
    expect(json["anio"]).toBeNull();
    expect(json["autores"]).toEqual(["A1", "A0"]);
    expect((json["relaciones"] as string[]).length).toBe(res.fragments.length);
  });

  it("no avisa nada cuando todas las respuestas son válidas", async () => {
    const res = await analyzeDocument(project(24000), ["uno"], async () => ({
      content: "{}",
      ms: 1,
    }));
    expect(res.warnings).toEqual([]);
  });
});
