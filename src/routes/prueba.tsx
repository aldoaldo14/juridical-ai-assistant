import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { type BenchRun, type Endpoint, download, median, uid, useBenchRuns } from "@/lib/store";
import { chat, ocrPage } from "@/lib/local-ai";
import { openPdf } from "@/lib/pdf";
import { Button, Card, Field, Input, Textarea } from "@/components/ui-lite";
import { EndpointFields } from "@/components/EndpointFields";

export const Route = createFileRoute("/prueba")({
  head: () => ({
    meta: [
      { title: "Prueba de rendimiento — Gabinete" },
      { name: "description", content: "Mide segundos por página de tus modelos locales de OCR y análisis en tu GPU." },
      { property: "og:title", content: "Prueba de rendimiento — Gabinete" },
      { property: "og:description", content: "Compara modelos locales con tiempos reales por página." },
    ],
  }),
  component: Bench,
});

const STEPS = [
  ["Prepara un set de prueba", "Elige 3 PDFs de 5–10 páginas: uno con texto digital, uno escaneado y uno con tablas estadísticas. Usa siempre los mismos para que las comparaciones sean justas."],
  ["Instala un servidor local (el que prefieras)", "Cualquier programa que ofrezca una dirección compatible con OpenAI sirve: por ejemplo LM Studio, Ollama, llama.cpp o vLLM. La app no te obliga a ninguno; precisamente esta prueba sirve para decidir."],
  ["Permite que esta página lo use", "En LM Studio: Server Settings → activa “Enable CORS” y “Serve on Local Network”. En Ollama: variable OLLAMA_ORIGINS=*. Usa la dirección exacta, p. ej. http://127.0.0.1:1234/v1. Si aún sale “failed to fetch”, el navegador bloquea la llamada porque esta página es HTTPS y tu servidor es HTTP: en Chrome/Edge abre chrome://flags/#allow-insecure-localhost, actívalo y reinicia el navegador. Luego pulsa “Probar conexión” abajo."],
  ["Abre un monitor de memoria", "En una terminal ejecuta: nvidia-smi -l 1. Anota la memoria máxima usada durante cada corrida."],
  ["Corre cada modelo 3 veces", "La primera página suele ser lenta (carga del modelo). La app reporta la mediana, que ignora ese arranque. Prueba OCR con PaddleOCR-VL y, si Gemma 4 acepta imágenes en tu servidor, también OCR con Gemma para comparar."],
  ["Prueba ambos modelos a la vez", "Carga los dos modelos y repite: si la memoria no alcanza o el tiempo se dispara, conviene trabajar por turnos (primero OCR de todo, luego análisis)."],
  ["Decide", "Compara la tabla de abajo: segundos por página, errores y memoria. Con esos datos configura tu proyecto."],
];

function Bench() {
  const [runs, saveRuns] = useBenchRuns();
  const [ep, setEp] = useState<Endpoint>({ baseUrl: "http://localhost:1234/v1", model: "" });
  const [task, setTask] = useState<BenchRun["task"]>("ocr");
  const [prompt, setPrompt] = useState("OCR:");
  const [aPrompt, setAPrompt] = useState("Resume esta página en 3 puntos y lista las normas o datos estadísticos citados, en JSON.");
  const [scale, setScale] = useState(2);
  const [maxPages, setMaxPages] = useState(5);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!file || !ep.model) return;
    setBusy(true);
    const r: BenchRun = { id: uid(), date: new Date().toISOString(), label: label || `${ep.model} · ${task}`, task, baseUrl: ep.baseUrl, model: ep.model, file: file.name, pages: [] };
    try {
      const pdf = await openPdf(file);
      const n = Math.min(pdf.numPages, maxPages);
      for (let i = 1; i <= n; i++) {
        setLog(`Página ${i} de ${n}…`);
        try {
          const res =
            task === "ocr"
              ? await ocrPage(ep, prompt, await pdf.renderPage(i, scale))
              : await chat(ep, [{ role: "user", content: `${aPrompt}\n\n${await pdf.pageText(i)}` }]);
          r.pages.push({ page: i, ms: res.ms, chars: res.content.length, tokens: res.tokens });
        } catch (e) {
          r.pages.push({ page: i, ms: 0, chars: 0, error: e instanceof Error ? e.message : String(e) });
          if (i === 1) break;
        }
      }
      saveRuns((prev) => [r, ...prev]);
      setLog(`Listo: ${r.pages.length} página(s) medidas.`);
    } catch (e) {
      setLog(e instanceof Error ? e.message : "No se pudo leer el PDF");
    }
    setBusy(false);
  };

  const ok = (r: BenchRun) => r.pages.filter((p) => !p.error);
  const update = (id: string, patch: Partial<BenchRun>) => saveRuns((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const exportCsv = () => {
    const rows = [["corrida", "modelo", "tarea", "archivo", "pagina", "segundos", "caracteres", "tokens", "vram_gb", "error"]];
    runs.forEach((r) => r.pages.forEach((p) => rows.push([r.label, r.model, r.task, r.file, String(p.page), (p.ms / 1000).toFixed(2), String(p.chars), String(p.tokens ?? ""), String(r.vramGB ?? ""), p.error ?? ""])));
    download("prueba-rendimiento.csv", rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Prueba de rendimiento</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Ningún resultado se da por hecho: las cifras de abajo salen solo de mediciones reales en tu RTX 5070.</p>
      </header>

      <Card title="Guía paso a paso">
        <ol className="space-y-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-sm text-primary-foreground">{i + 1}</span>
              <div><p className="font-medium">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Ejecutar una medición">
        <div className="space-y-4">
          <EndpointFields value={ep} onChange={setEp} />
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={task === "ocr"} onChange={() => setTask("ocr")} /> OCR (imagen de cada página)</label>
            <label className="flex items-center gap-2"><input type="radio" checked={task === "analisis"} onChange={() => setTask("analisis")} /> Análisis (texto de cada página)</label>
          </div>
          {task === "ocr" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Instrucción de OCR"><Input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
              <Field label="Resolución"><Input type="number" min={1} max={4} step={0.5} value={scale} onChange={(e) => setScale(Number(e.target.value))} /></Field>
            </div>
          ) : (
            <Field label="Instrucción de análisis"><Textarea rows={2} value={aPrompt} onChange={(e) => setAPrompt(e.target.value)} /></Field>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="PDF de prueba"><Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
            <Field label="Páginas máximas"><Input type="number" min={1} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} /></Field>
            <Field label="Etiqueta (opcional)"><Input placeholder="p. ej. Paddle Q8 escaneado" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={busy || !file || !ep.model}>{busy ? "Midiendo…" : "Iniciar medición"}</Button>
            <span className="text-sm text-muted-foreground">{log}</span>
          </div>
        </div>
      </Card>

      <Card title={<div className="flex items-center justify-between">Resultados medidos {runs.length > 0 && <Button variant="ghost" onClick={exportCsv}>Exportar CSV</Button>}</div>}>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin mediciones todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-2">Corrida</th><th>Tarea</th><th>Páginas</th><th>Mediana s/pág</th><th>Primera pág</th><th>Tokens/s</th><th>Errores</th><th>VRAM GB</th><th></th></tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const good = ok(r);
                  const tps = good.filter((p) => p.tokens).map((p) => p.tokens! / (p.ms / 1000));
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2"><div className="font-medium">{r.label}</div><div className="text-xs text-muted-foreground">{r.file}</div></td>
                      <td>{r.task === "ocr" ? "OCR" : "Análisis"}</td>
                      <td>{good.length}/{r.pages.length}</td>
                      <td className="font-serif text-lg">{good.length ? (median(good.map((p) => p.ms)) / 1000).toFixed(1) : "—"}</td>
                      <td>{good[0] ? (good[0]!.ms / 1000).toFixed(1) : "—"}</td>
                      <td>{tps.length ? median(tps).toFixed(1) : "—"}</td>
                      <td className={r.pages.length - good.length ? "text-destructive" : ""} title={r.pages.find((p) => p.error)?.error}>{r.pages.length - good.length}</td>
                      <td><Input className="w-20" type="number" step={0.1} value={r.vramGB ?? ""} onChange={(e) => update(r.id, { vramGB: e.target.value ? Number(e.target.value) : undefined })} /></td>
                      <td><Button variant="danger" onClick={() => saveRuns((prev) => prev.filter((x) => x.id !== r.id))}>✕</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
