import type { Endpoint } from "./store";

type Msg = { role: "system" | "user"; content: unknown };

const base = (u: string) => {
  let s = u.trim().replace(/\/+$/, "");
  // Corrige errores típicos de escritura: "http//", "http:/", "htp://", etc.
  s = s.replace(/^(h?t?t?ps?)?:?\/+/i, (m) => (/^h?t?t?ps/i.test(m) ? "https://" : "http://"));
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  if (!/\/v1$/i.test(s) && !/\/v1\//i.test(s)) s = `${s}/v1`;
  return s;
};
const headers = (ep: Endpoint) => ({
  "Content-Type": "application/json",
  ...(ep.apiKey ? { Authorization: `Bearer ${ep.apiKey}` } : {}),
});

function explainFetchFailure(url: string): Error {
  const httpsPage = typeof window !== "undefined" && window.location.protocol === "https:";
  const httpTarget = url.startsWith("http://");
  if (httpsPage && httpTarget) {
    return new Error(
      "No se pudo conectar. Tu servidor local está en HTTP y esta página en HTTPS; Chrome normalmente lo permite, así que casi siempre la causa es CORS. " +
        "Soluciones: (1) en LM Studio activa “Enable CORS” en Server Settings y vuelve a probar; " +
        "(2) verifica que la dirección sea exacta: http://127.0.0.1:1234/v1; " +
        "(3) si aún falla, prueba en Firefox, o dime y preparamos la app para correrla en local (HTTP).",
    );
  }
  return new Error(
    "No se pudo conectar. Revisa que el servidor esté encendido, que la dirección sea exacta (p. ej. http://127.0.0.1:1234/v1) " +
      "y que CORS esté activado (en LM Studio: Server Settings → Enable CORS).",
  );
}

export async function listModels(ep: Endpoint): Promise<string[]> {
  const url = `${base(ep.baseUrl)}/models`;
  let r: Response;
  try {
    r = await fetch(url, { headers: headers(ep) });
  } catch {
    throw explainFetchFailure(url);
  }
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
    throw explainFetchFailure(`${base(ep.baseUrl)}/chat/completions`);
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
