import type { Endpoint } from "./store";

type Msg = { role: "system" | "user"; content: unknown };

const base = (u: string) => u.trim().replace(/\/+$/, "");
const headers = (ep: Endpoint) => ({
  "Content-Type": "application/json",
  ...(ep.apiKey ? { Authorization: `Bearer ${ep.apiKey}` } : {}),
});

export async function listModels(ep: Endpoint): Promise<string[]> {
  const r = await fetch(`${base(ep.baseUrl)}/models`, { headers: headers(ep) });
  if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
  const j = await r.json();
  return (j.data ?? []).map((m: { id: string }) => m.id);
}

export async function chat(ep: Endpoint, messages: Msg[]) {
  const t0 = performance.now();
  let r: Response;
  try {
    r = await fetch(`${base(ep.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: headers(ep),
      body: JSON.stringify({ model: ep.model, messages, temperature: 0, stream: false }),
    });
  } catch {
    throw new Error("No se pudo conectar. ¿Está encendido el servidor local y permite CORS?");
  }
  const ms = performance.now() - t0;
  if (!r.ok) throw new Error(`Error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const content: string = j.choices?.[0]?.message?.content ?? "";
  return { content, ms, tokens: j.usage?.completion_tokens as number | undefined };
}

export const ocrPage = (ep: Endpoint, prompt: string, dataUrl: string) =>
  chat(ep, [
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: prompt },
      ],
    },
  ]);

export function parseJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  try {
    return JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    return { _sin_formato_json: text };
  }
}
