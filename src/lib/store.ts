import { useEffect, useState, useCallback } from "react";

export type Endpoint = { baseUrl: string; model: string; apiKey?: string };
export type Variable = { name: string; description: string; type: "texto" | "número" | "fecha" | "lista" | "sí/no" };
/** Valor permitido de una categoría, con su definición operativa (opcional). */
export type CategoryValue = { value: string; definition: string };
/**
 * Categoría de lista cerrada del libro de códigos.
 * - nivel "documento": un valor para todo el documento (clave en el registro principal).
 * - nivel "hallazgo": un valor para cada hallazgo (clave dentro de cada elemento de "hallazgos").
 */
export type Category = {
  name: string;
  description: string;
  level: "documento" | "hallazgo";
  multiple: boolean;
  values: CategoryValue[];
};
export type Project = {
  id: string;
  name: string;
  topic: string;
  ocrMode: "modelo" | "texto-pdf";
  ocr: Endpoint & { prompt: string; scale: number };
  /** strictJson: enviar el esquema JSON al servidor para que la respuesta lo cumpla (por omisión, sí). */
  llm: Endpoint & { systemPrompt: string; maxChars: number; strictJson?: boolean };
  variables: Variable[];
  /** Libro de códigos. Los proyectos creados antes de esta función no lo tienen. */
  categories?: Category[];
  createdAt: string;
};
export type BenchPage = { page: number; ms: number; chars: number; tokens?: number | undefined; error?: string };
export type BenchRun = {
  id: string;
  date: string;
  label: string;
  task: "ocr" | "analisis";
  baseUrl: string;
  model: string;
  file: string;
  pages: BenchPage[];
  vramGB?: number | undefined;
  notes?: string;
};
/** Resultado parcial del modelo de análisis sobre un fragmento del documento. */
export type FragmentResult = {
  fragment: number;
  firstPage: number;
  lastPage: number;
  ms: number;
  json: unknown;
  /** Por qué la respuesta de este fragmento no sirvió (vacía, sin JSON, límite de contexto). */
  problem?: string;
};
export type DocResult = {
  id: string;
  projectId: string;
  file: string;
  date: string;
  pages: number;
  ocrMs: number;
  llmMs: number;
  text: string;
  json: unknown;
  /** Solo en documentos analizados por partes: lo que el modelo extrajo de cada fragmento. */
  fragments?: FragmentResult[];
  /** Si el servidor rechazó el esquema JSON y la respuesta se pidió sin él. */
  schemaRejected?: boolean;
  /** Partes del documento que el modelo no codificó o que se unieron sin él. */
  warnings?: string[];
  error?: string;
};

const KEYS = { projects: "lab.projects", bench: "lab.bench", results: "lab.results" } as const;
const listeners = new Set<() => void>();

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  listeners.forEach((l) => l());
}

function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    const sync = () => setValue(read(key, fallback));
    sync();
    listeners.add(sync);
    return () => void listeners.delete(sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const save = useCallback((updater: (prev: T) => T) => write(key, updater(read(key, fallback))), [key, fallback]);
  return [value, save] as const;
}

const EMPTY: never[] = [];
export const useProjects = () => useStored<Project[]>(KEYS.projects, EMPTY);
export const useBenchRuns = () => useStored<BenchRun[]>(KEYS.bench, EMPTY);
export const useResults = () => useStored<DocResult[]>(KEYS.results, EMPTY);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function newProject(): Project {
  return {
    id: uid(),
    name: "Nuevo proyecto",
    topic: "",
    ocrMode: "modelo",
    ocr: { baseUrl: "http://localhost:8000/v1", model: "", prompt: "OCR:", scale: 2 },
    llm: {
      baseUrl: "http://localhost:11434/v1",
      model: "",
      maxChars: 24000,
      strictJson: true,
      systemPrompt:
        "Eres un asistente de investigación jurídica. Lee el texto del documento y extrae las variables solicitadas. Responde SOLO con un objeto JSON válido. Si un dato no aparece, usa null. Incluye además una clave \"relaciones\" con una lista breve de relaciones relevantes entre conceptos, normas, actores o datos estadísticos.",
    },
    variables: [
      { name: "titulo", description: "Título del artículo", type: "texto" },
      { name: "autores", description: "Autores", type: "lista" },
      { name: "anio", description: "Año de publicación", type: "número" },
    ],
    categories: [],
    createdAt: new Date().toISOString(),
  };
}

export function median(nums: number[]) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
