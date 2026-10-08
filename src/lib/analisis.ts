// Paso 2 del proceso: codificación de variables con el modelo de análisis.
// Los documentos que no caben en un fragmento se analizan por partes y se consolidan al final,
// para que el modelo lea el documento completo y no solo sus primeras páginas.

import type { FragmentResult, Project } from "./store";
import { type ChatOptions, type Msg, parseJson } from "./local-ai";
import { type Fragment, fragmentLimit, pageRange, splitIntoFragments } from "./fragmentos";
import {
  type Finding,
  buildSchema,
  categoriesPrompt,
  findingsOf,
  usesFindings,
  verifyFindings,
  withFindings,
  withoutFindings,
} from "./categorias";

export type ChatFn = (
  ep: Project["llm"],
  messages: Msg[],
  opts?: ChatOptions,
) => Promise<{
  content: string;
  ms: number;
  schemaRejected?: boolean;
  finishReason?: string | undefined;
  reasoningChars?: number;
}>;

export type Analysis = {
  json: unknown;
  ms: number; // fragmentos + consolidación
  consolidationMs: number;
  fragments: FragmentResult[];
  /** Algún paso se hizo sin esquema porque el servidor lo rechazó. */
  schemaRejected: boolean;
  /** Fragmentos o consolidaciones sin respuesta utilizable. Si hay avisos, faltan datos del documento. */
  warnings: string[];
};

/** Error de un fragmento; conserva los resultados parciales ya obtenidos. */
export class AnalysisError extends Error {
  constructor(
    message: string,
    public fragments: FragmentResult[],
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export const CONSOLIDATION_PROMPT =
  "Eres un asistente de investigación jurídica. Recibirás resultados parciales en JSON, extraídos de fragmentos consecutivos de un mismo documento. " +
  "Consolídalos en un solo objeto JSON con las mismas claves. " +
  "Usa solo la información de los resultados parciales; no añadas nada. " +
  "Para cada variable conserva el valor que aparezca; si varios fragmentos dan valores distintos, elige el más completo. " +
  'En las variables de tipo lista y en "relaciones", une los elementos de todos los fragmentos sin repetirlos. ' +
  "Si ningún fragmento contiene un dato, usa null. Responde SOLO con el objeto JSON válido.";

/** Tema, variables y categorías. `findings: false` omite las instrucciones de hallazgos (consolidación). */
const head = (p: Project, findings: boolean) => {
  const vars = p.variables.map((v) => `- "${v.name}" (${v.type}): ${v.description}`).join("\n");
  const cats = categoriesPrompt(p, { findings });
  return `Tema del proyecto: ${p.topic || "(sin especificar)"}\n\nVariables a extraer:\n${vars}${cats ? `\n\n${cats}` : ""}`;
};

export function buildPrompt(p: Project, f: Fragment, total: number) {
  const note =
    total > 1
      ? `\n\nEste texto es el fragmento ${f.index} de ${total} de un documento más largo (${pageRange(f)}). ` +
        "Extrae solo lo que aparezca en este fragmento y usa null para lo que no aparezca; no supongas lo que dicen los demás fragmentos."
      : "";
  return `${head(p, true)}${note}\n\nTexto del documento:\n${f.text}`;
}

const strict = (p: Project) => p.llm.strictJson !== false;

const parsed = (json: unknown) =>
  !!json && typeof json === "object" && !Array.isArray(json) && !("_sin_formato_json" in json);

/** Explica por qué una respuesta no sirve, o null si sirve. */
function problem(
  res: { content: string; finishReason?: string | undefined; reasoningChars?: number },
  json: unknown,
) {
  if (parsed(json)) return null;
  const what = res.content.trim() ? "respuesta sin JSON válido" : "respuesta vacía";
  if (res.finishReason !== "length") return what;
  const thinking = res.reasoningChars
    ? `; razonó ${res.reasoningChars.toLocaleString("es-MX")} caracteres antes de responder`
    : "";
  return (
    `${what}: el modelo agotó el límite de tokens o de contexto${thinking}. ` +
    "Reduce el máximo de caracteres por fragmento, amplía el contexto del modelo o desactiva el razonamiento."
  );
}

/**
 * Unión sin modelo, para cuando la consolidación falla: en las listas, todos los elementos sin
 * repetir; en los demás valores, el más frecuente entre los parciales (empate: el primero).
 */
export function mergeWithoutModel(jsons: unknown[]) {
  const objs = jsons.filter(parsed) as Record<string, unknown>[];
  const keys = [...new Set(objs.flatMap((o) => Object.keys(o)))];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const vals = objs.map((o) => o[k]).filter((v) => v !== null && v !== undefined && v !== "");
    if (vals.some(Array.isArray)) {
      const seen = new Map<string, unknown>();
      vals
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .forEach((v) => seen.set(JSON.stringify(v), v));
      out[k] = [...seen.values()];
    } else {
      const count = new Map<string, { v: unknown; n: number }>();
      vals.forEach((v) => {
        const key = JSON.stringify(v);
        count.set(key, { v, n: (count.get(key)?.n ?? 0) + 1 });
      });
      out[k] = [...count.values()].sort((a, b) => b.n - a.n)[0]?.v ?? null;
    }
  }
  return out;
}

type Piece = { first: number; last: number; firstPage: number; lastPage: number; json: unknown };

const label = (x: Piece) =>
  `${x.first === x.last ? `Fragmento ${x.first}` : `Fragmentos ${x.first}–${x.last}`} (${pageRange(x)})`;

const render = (x: Piece) => `### ${label(x)}\n${JSON.stringify(x.json, null, 1)}`;

/** Agrupa piezas consecutivas dentro del límite; cada grupo lleva al menos dos para avanzar siempre. */
function batches(pieces: Piece[], limit: number): Piece[][] {
  const out: Piece[][] = [];
  let current: Piece[] = [];
  let size = 0;
  for (const piece of pieces) {
    const len = render(piece).length + 2;
    if (current.length >= 2 && size + len > limit) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(piece);
    size += len;
  }
  if (current.length === 1 && out.length) out[out.length - 1]!.push(...current);
  else if (current.length) out.push(current);
  return out;
}

async function consolidate(
  p: Project,
  pieces: Piece[],
  chat: ChatFn,
  onProgress?: (message: string) => void,
) {
  const limit = fragmentLimit(p.llm.maxChars);
  const schema = strict(p) ? buildSchema(p, { findings: false }) : undefined;
  let ms = 0;
  let schemaRejected = false;
  const warnings: string[] = [];
  let current = pieces;
  for (;;) {
    const groups = batches(current, limit);
    const next: Piece[] = [];
    for (const [i, group] of groups.entries()) {
      onProgress?.(
        groups.length > 1
          ? `consolidando resultados (grupo ${i + 1}/${groups.length})…`
          : "consolidando resultados…",
      );
      const first = group[0]!;
      const last = group[group.length - 1]!;
      const res = await chat(
        p.llm,
        [
          { role: "system", content: CONSOLIDATION_PROMPT },
          {
            role: "user",
            content: `${head(p, false)}\n\nResultados parciales (${group.length}):\n\n${group.map(render).join("\n\n")}`,
          },
        ],
        { schema },
      );
      ms += res.ms;
      schemaRejected ||= !!res.schemaRejected;
      let json = parseJson(res.content);
      const issue = problem(res, json);
      if (issue) {
        json = mergeWithoutModel(group.map((x) => x.json));
        warnings.push(
          `Consolidación de ${label({ first: first.first, last: last.last, firstPage: first.firstPage, lastPage: last.lastPage, json })}: ${issue} Se unieron los parciales sin el modelo.`,
        );
      }
      next.push({
        first: first.first,
        last: last.last,
        firstPage: first.firstPage,
        lastPage: last.lastPage,
        json,
      });
    }
    if (next.length === 1) return { json: next[0]!.json, ms, schemaRejected, warnings };
    current = next;
  }
}

/**
 * Codifica un documento a partir del texto de sus páginas.
 * Si cabe en un fragmento, hace una sola llamada; si no, una por fragmento y una consolidación.
 */
export async function analyzeDocument(
  p: Project,
  pages: string[],
  chat: ChatFn,
  onProgress?: (message: string) => void,
): Promise<Analysis> {
  const parts = splitIntoFragments(pages, p.llm.maxChars);
  const total = parts.length;
  const fragments: FragmentResult[] = [];
  const schema = strict(p) ? buildSchema(p, { findings: true }) : undefined;
  const findings = usesFindings(p);
  let schemaRejected = false;
  const warnings: string[] = [];

  for (const f of parts) {
    onProgress?.(
      total > 1
        ? `codificando fragmento ${f.index}/${total} (${pageRange(f)})…`
        : "codificando variables…",
    );
    try {
      const res = await chat(
        p.llm,
        [
          { role: "system", content: p.llm.systemPrompt },
          { role: "user", content: buildPrompt(p, f, total) },
        ],
        { schema },
      );
      schemaRejected ||= !!res.schemaRejected;
      const json = parseJson(res.content);
      const issue = problem(res, json);
      if (issue)
        warnings.push(
          total > 1 ? `Fragmento ${f.index}/${total} (${pageRange(f)}): ${issue}` : issue,
        );
      fragments.push({
        fragment: f.index,
        firstPage: f.firstPage,
        lastPage: f.lastPage,
        ms: res.ms,
        json,
        ...(issue ? { problem: issue } : {}),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new AnalysisError(
        total > 1 ? `Fragmento ${f.index}/${total} (${pageRange(f)}): ${message}` : message,
        fragments,
      );
    }
  }

  const mapMs = fragments.reduce((sum, f) => sum + f.ms, 0);
  // Los hallazgos no pasan por la consolidación: se unen en orden y se verifican contra el texto.
  const merged: Finding[] = verifyFindings(
    fragments.flatMap((f) => findingsOf(f.json)),
    pages,
  );
  const finish = (json: unknown) => (findings && parsed(json) ? withFindings(json, merged) : json);

  if (total === 1)
    return {
      json: finish(fragments[0]!.json),
      ms: mapMs,
      consolidationMs: 0,
      fragments,
      schemaRejected,
      warnings,
    };

  // Solo se consolidan los fragmentos con respuesta utilizable.
  const usable = fragments.filter((f) => !f.problem);
  if (usable.length <= 1)
    return {
      json: finish(usable[0] ? withoutFindings(usable[0].json) : {}),
      ms: mapMs,
      consolidationMs: 0,
      fragments,
      schemaRejected,
      warnings,
    };

  try {
    const pieces = usable.map((f) => ({
      first: f.fragment,
      last: f.fragment,
      firstPage: f.firstPage,
      lastPage: f.lastPage,
      json: findings ? withoutFindings(f.json) : f.json,
    }));
    const c = await consolidate(p, pieces, chat, onProgress);
    return {
      json: findings ? withFindings(c.json, merged) : c.json,
      ms: mapMs + c.ms,
      consolidationMs: c.ms,
      fragments,
      schemaRejected: schemaRejected || c.schemaRejected,
      warnings: [...warnings, ...c.warnings],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new AnalysisError(`Consolidación: ${message}`, fragments);
  }
}
