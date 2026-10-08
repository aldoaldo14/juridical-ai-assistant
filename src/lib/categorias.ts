// Libro de códigos: categorías de lista cerrada, su esquema JSON, su descripción para el modelo,
// la verificación literal de las citas de cada hallazgo y la exportación a CSV.

import type { Category, DocResult, Project } from "./store";

export const FINDINGS_KEY = "hallazgos";

const named = <T extends { name: string }>(xs: T[] | undefined) =>
  (xs ?? []).filter((x) => x.name.trim());

/** Categorías utilizables (con nombre y al menos un valor). */
export const categoriesOf = (p: Project, level?: Category["level"]) =>
  named(p.categories).filter(
    (c) => c.values.some((v) => v.value.trim()) && (!level || c.level === level),
  );

export const usesFindings = (p: Project) => categoriesOf(p, "hallazgo").length > 0;

const valuesOf = (c: Category) => c.values.map((v) => v.value.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Esquema JSON (response_format de la API compatible con OpenAI)

type Schema = Record<string, unknown>;

const categorySchema = (c: Category): Schema =>
  c.multiple
    ? { type: "array", items: { type: "string", enum: valuesOf(c) } }
    : { type: "string", enum: valuesOf(c) };

const variableSchema: Record<string, Schema> = {
  texto: { type: ["string", "null"] },
  fecha: { type: ["string", "null"] },
  número: { type: ["number", "null"] },
  lista: { type: ["array", "null"], items: { type: "string" } },
  "sí/no": { type: ["boolean", "null"] },
};

/**
 * Esquema del registro que debe devolver el modelo.
 * `findings: false` lo omite (para la consolidación, que no recibe hallazgos).
 * "relaciones" se incluye solo si las instrucciones al modelo la piden.
 */
export function buildSchema(p: Project, opts: { findings: boolean }): Schema {
  const properties: Record<string, Schema> = {};
  for (const v of named(p.variables))
    properties[v.name] = variableSchema[v.type] ?? { type: ["string", "null"] };
  for (const c of categoriesOf(p, "documento")) properties[c.name] = categorySchema(c);
  if (/relaciones/i.test(p.llm.systemPrompt))
    properties["relaciones"] = { type: "array", items: { type: "string" } };
  if (opts.findings && usesFindings(p)) {
    const item: Record<string, Schema> = {
      cita: { type: "string" },
      pagina: { type: ["integer", "null"] },
      resumen: { type: "string" },
    };
    for (const c of categoriesOf(p, "hallazgo")) item[c.name] = categorySchema(c);
    properties[FINDINGS_KEY] = {
      type: "array",
      items: {
        type: "object",
        properties: item,
        required: Object.keys(item),
        additionalProperties: false,
      },
    };
  }
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------
// Descripción para el modelo

const describeCategory = (c: Category) => {
  const how = c.multiple ? "una o varias opciones" : "una sola opción";
  const values = c.values
    .filter((v) => v.value.trim())
    .map((v) => `    · "${v.value.trim()}"${v.definition.trim() ? `: ${v.definition.trim()}` : ""}`)
    .join("\n");
  return `- "${c.name}" (${how}): ${c.description}\n${values}`;
};

/** Texto que se añade a las instrucciones; vacío si el proyecto no tiene categorías. */
export function categoriesPrompt(p: Project, opts: { findings: boolean }) {
  const parts: string[] = [];
  const doc = categoriesOf(p, "documento");
  if (doc.length)
    parts.push(
      `Categorías del documento (usa exactamente uno de los valores indicados, escrito igual):\n${doc.map(describeCategory).join("\n")}`,
    );
  const fin = categoriesOf(p, "hallazgo");
  if (opts.findings && fin.length)
    parts.push(
      `Hallazgos: incluye la clave "${FINDINGS_KEY}", una lista de las afirmaciones del texto relevantes para el tema del proyecto. Para cada hallazgo:\n` +
        '- "cita": fragmento copiado literalmente del texto, sin cambiar, resumir ni omitir palabras (máximo 300 caracteres).\n' +
        '- "pagina": número de la página donde aparece la cita, según los encabezados "--- Página N ---".\n' +
        '- "resumen": la afirmación en una oración.\n' +
        `${fin.map(describeCategory).join("\n")}\n` +
        "Clasifica cada hallazgo por lo que dice el texto, no por lo que supongas. Si no hay hallazgos, usa una lista vacía.",
    );
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Hallazgos: unión entre fragmentos y verificación literal de citas

export type Finding = Record<string, unknown> & { cita?: unknown; pagina?: unknown };

export const findingsOf = (json: unknown): Finding[] => {
  const list =
    json && typeof json === "object" ? (json as Record<string, unknown>)[FINDINGS_KEY] : undefined;
  return Array.isArray(list) ? list.filter((f): f is Finding => !!f && typeof f === "object") : [];
};

/** Normaliza para comparar: une palabras cortadas con guion al final de línea, comillas, espacios y mayúsculas. */
export const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .replace(/[“”«»„"]/g, '"')
    .replace(/[‘’`´]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Añade a cada hallazgo si su cita aparece literalmente en el documento
 * ("cita_verificada") y en qué páginas ("paginas_cita").
 */
export function verifyFindings(findings: Finding[], pages: string[]): Finding[] {
  const norm = pages.map(normalize);
  return findings.map((f) => {
    const cita = typeof f.cita === "string" ? normalize(f.cita) : "";
    const found = cita ? norm.flatMap((t, i) => (t.includes(cita) ? [i + 1] : [])) : [];
    return { ...f, cita_verificada: found.length > 0, paginas_cita: found };
  });
}

/** Sustituye la lista de hallazgos de un registro. */
export const withFindings = (json: unknown, findings: Finding[]) => ({
  ...(json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : { resultado: json }),
  [FINDINGS_KEY]: findings,
});

/** Quita la lista de hallazgos (para enviar a la consolidación solo lo demás). */
export function withoutFindings(json: unknown) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const { [FINDINGS_KEY]: _omit, ...rest } = json as Record<string, unknown>;
  return rest;
}

// ---------------------------------------------------------------------------
// Exportación: una fila por hallazgo

const cell = (v: unknown) => {
  const s =
    v == null
      ? ""
      : Array.isArray(v)
        ? v.join("; ")
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function findingsCsv(p: Project, results: DocResult[]) {
  const doc = categoriesOf(p, "documento").map((c) => c.name);
  const fin = categoriesOf(p, "hallazgo").map((c) => c.name);
  const columns = [
    "archivo",
    ...doc,
    "pagina",
    "cita",
    "cita_verificada",
    "paginas_cita",
    "resumen",
    ...fin,
  ];
  const rows = results.flatMap((r) => {
    const json = (r.json && typeof r.json === "object" ? r.json : {}) as Record<string, unknown>;
    return findingsOf(r.json).map((f) => [
      r.file,
      ...doc.map((k) => json[k]),
      f.pagina,
      f.cita,
      f["cita_verificada"] === undefined ? "" : f["cita_verificada"] ? "sí" : "no",
      f["paginas_cita"],
      f["resumen"],
      ...fin.map((k) => f[k]),
    ]);
  });
  // El BOM permite que Excel reconozca los acentos.
  return "\uFEFF" + [columns, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}
