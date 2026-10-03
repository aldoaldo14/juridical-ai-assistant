// Paso 2 del proceso: codificación de variables con el modelo de análisis.
// Los documentos que no caben en un fragmento se analizan por partes y se consolidan al final,
// para que el modelo lea el documento completo y no solo sus primeras páginas.

import type { FragmentResult, Project } from "./store";
import { type Msg, parseJson } from "./local-ai";
import { type Fragment, fragmentLimit, pageRange, splitIntoFragments } from "./fragmentos";

export type ChatFn = (
  ep: Project["llm"],
  messages: Msg[],
) => Promise<{ content: string; ms: number }>;

export type Analysis = {
  json: unknown;
  ms: number; // fragmentos + consolidación
  consolidationMs: number;
  fragments: FragmentResult[];
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

const head = (p: Project) => {
  const vars = p.variables.map((v) => `- "${v.name}" (${v.type}): ${v.description}`).join("\n");
  return `Tema del proyecto: ${p.topic || "(sin especificar)"}\n\nVariables a extraer:\n${vars}`;
};

export function buildPrompt(p: Project, f: Fragment, total: number) {
  const note =
    total > 1
      ? `\n\nEste texto es el fragmento ${f.index} de ${total} de un documento más largo (${pageRange(f)}). ` +
        "Extrae solo lo que aparezca en este fragmento y usa null para lo que no aparezca; no supongas lo que dicen los demás fragmentos."
      : "";
  return `${head(p)}${note}\n\nTexto del documento:\n${f.text}`;
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
  let ms = 0;
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
      const res = await chat(p.llm, [
        { role: "system", content: CONSOLIDATION_PROMPT },
        {
          role: "user",
          content: `${head(p)}\n\nResultados parciales (${group.length}):\n\n${group.map(render).join("\n\n")}`,
        },
      ]);
      ms += res.ms;
      next.push({
        first: first.first,
        last: last.last,
        firstPage: first.firstPage,
        lastPage: last.lastPage,
        json: parseJson(res.content),
      });
    }
    if (next.length === 1) return { json: next[0]!.json, ms };
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

  for (const f of parts) {
    onProgress?.(
      total > 1
        ? `codificando fragmento ${f.index}/${total} (${pageRange(f)})…`
        : "codificando variables…",
    );
    try {
      const res = await chat(p.llm, [
        { role: "system", content: p.llm.systemPrompt },
        { role: "user", content: buildPrompt(p, f, total) },
      ]);
      fragments.push({
        fragment: f.index,
        firstPage: f.firstPage,
        lastPage: f.lastPage,
        ms: res.ms,
        json: parseJson(res.content),
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
  if (total === 1) return { json: fragments[0]!.json, ms: mapMs, consolidationMs: 0, fragments };

  try {
    const pieces = fragments.map((f) => ({
      first: f.fragment,
      last: f.fragment,
      firstPage: f.firstPage,
      lastPage: f.lastPage,
      json: f.json,
    }));
    const c = await consolidate(p, pieces, chat, onProgress);
    return { json: c.json, ms: mapMs + c.ms, consolidationMs: c.ms, fragments };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new AnalysisError(`Consolidación: ${message}`, fragments);
  }
}
