import { describe, expect, it } from "vitest";

import {
  buildSchema,
  categoriesPrompt,
  findingsCsv,
  comparable,
  verifyFindings,
} from "./categorias";
import { TESIS_CATEGORIES } from "./libro-codigos-tesis";
import { type DocResult, type Project, newProject } from "./store";

type Sch = {
  type?: unknown;
  enum?: string[];
  items?: Sch;
  properties?: Record<string, Sch>;
  required?: string[];
};

const tesis = (): Project => ({ ...newProject(), categories: structuredClone(TESIS_CATEGORIES) });

describe("libro de códigos de la tesis", () => {
  it("no repite claves ni valores dentro de una categoría", () => {
    const names = TESIS_CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    TESIS_CATEGORIES.forEach((c) => {
      const values = c.values.map((v) => v.value);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  it("no menciona la hipótesis ante el modelo", () => {
    const prompt = categoriesPrompt(tesis(), { findings: true });
    expect(prompt).not.toMatch(/hip[óo]tesis|predominantemente|en menor medida/i);
  });
});

describe("buildSchema", () => {
  it("convierte variables y categorías en un esquema cerrado", () => {
    const schema = buildSchema(tesis(), { findings: true }) as {
      properties: Record<string, Sch>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.properties["anio"]).toEqual({ type: ["number", "null"] });
    expect(schema.properties["tipo_documento"]!.enum).toContain("doctrina");
    expect(schema.properties["relaciones"]).toEqual({ type: "array", items: { type: "string" } });

    const item = schema.properties["hallazgos"]!.items!;
    expect(item.required).toEqual(Object.keys(item.properties!));
    expect(item.properties!["cita"]).toEqual({ type: "string" });
    expect(item.properties!["componente"]!.enum).toContain("institucional: capacidad operativa");
    expect(item.properties!["frente"]).toEqual({
      type: "array",
      items: {
        type: "string",
        enum: TESIS_CATEGORIES.find((c) => c.name === "frente")!.values.map((v) => v.value),
      },
    });
  });

  it("omite los hallazgos para la consolidación y las categorías vacías", () => {
    const p = tesis();
    p.categories!.push({
      name: "vacia",
      description: "",
      level: "documento",
      multiple: false,
      values: [{ value: " ", definition: "" }],
    });
    const schema = buildSchema(p, { findings: false }) as { properties: Record<string, unknown> };
    expect(schema.properties).not.toHaveProperty("hallazgos");
    expect(schema.properties).not.toHaveProperty("vacia");
    expect(schema.properties).toHaveProperty("tipo_documento");
  });

  it("no pide relaciones si las instrucciones no las mencionan", () => {
    const p = newProject();
    p.llm.systemPrompt = "Responde con JSON.";
    expect(
      (buildSchema(p, { findings: true }) as { properties: object }).properties,
    ).not.toHaveProperty("relaciones");
  });
});

describe("verifyFindings", () => {
  const pages = [
    "La UIF carece de per-\nsonal suficiente para supervisar a los sujetos obligados.",
    "El “beneficiario final” no se identifica   en la práctica.",
  ];

  it("encuentra citas aunque cambien saltos de línea, guiones de corte, comillas y mayúsculas", () => {
    const res = verifyFindings(
      [
        { cita: "la UIF carece de personal suficiente", pagina: 1 },
        { cita: 'El "beneficiario final" no se identifica en la práctica', pagina: 1 },
        { cita: "La FGR obtuvo 300 sentencias", pagina: 2 },
      ],
      pages,
    );
    expect(res.map((f) => [f["cita_verificada"], f["paginas_cita"]])).toEqual([
      [true, [1]],
      [true, [2]],
      [false, []],
    ]);
  });

  it("tolera los cortes del texto extraído por pdf.js, pero no omisiones ni puntos suspensivos", () => {
    const page = [
      "los países con vocación ex- portadora de capital podrían retener el flujo ( country-by-country-report )",
    ];
    const res = verifyFindings(
      [
        { cita: "Los países con vocación exportadora de capital podrían retener el flujo" },
        { cita: "(country-by-country-report)" },
        { cita: "los países con vocación... de capital podrían retener" },
        { cita: "de capital" },
      ],
      page,
    );
    expect(res.map((f) => f["cita_verificada"])).toEqual([true, true, false, false]);
    expect(comparable("  A —  b\n\nC ")).toBe("abc");
  });
});

describe("findingsCsv", () => {
  it("produce una fila por hallazgo con las categorías del documento repetidas", () => {
    const p = tesis();
    const r: DocResult = {
      id: "1",
      projectId: p.id,
      file: "art.pdf",
      date: "",
      pages: 2,
      ocrMs: 0,
      llmMs: 0,
      text: "",
      json: {
        tipo_documento: "doctrina",
        hallazgos: [
          {
            cita: 'dice "esto", y más',
            pagina: 2,
            resumen: "r",
            frente: ["supervisión (RI 3)", "beneficiario final (R. 24)"],
            cita_verificada: true,
            paginas_cita: [2],
          },
        ],
      },
    };
    const lines = findingsCsv(p, [r])
      .replace(/^\uFEFF/, "")
      .split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^archivo,tipo_documento,naturaleza_fuente,jurisdiccion,pagina,cita,cita_verificada,paginas_cita,resumen,componente,frente,/,
    );
    expect(lines[1]).toContain(
      'art.pdf,doctrina,,,2,"dice ""esto"", y más",sí,2,r,,supervisión (RI 3); beneficiario final (R. 24),',
    );
  });
});
