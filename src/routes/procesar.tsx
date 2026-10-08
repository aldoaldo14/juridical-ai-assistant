import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { type DocResult, download, uid, useProjects, useResults } from "@/lib/store";
import { chat, ocrPage } from "@/lib/local-ai";
import { AnalysisError, analyzeDocument } from "@/lib/analisis";
import { pageRange } from "@/lib/fragmentos";
import { findingsCsv, findingsOf, usesFindings } from "@/lib/categorias";
import { openPdf } from "@/lib/pdf";
import { Button, Card, Field, Input } from "@/components/ui-lite";

export const Route = createFileRoute("/procesar")({
  validateSearch: z.object({ proyecto: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Procesar PDFs — Gabinete" },
      { name: "description", content: "Convierte artículos jurídicos en registros JSON con tus modelos locales." },
      { property: "og:title", content: "Procesar PDFs — Gabinete" },
      { property: "og:description", content: "OCR y codificación local de documentos jurídicos." },
    ],
  }),
  component: Process,
});

function Process() {
  const { proyecto } = Route.useSearch();
  const [projects] = useProjects();
  const [results, saveResults] = useResults();
  const [pid, setPid] = useState(proyecto ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (!pid && projects[0]) setPid(projects[0].id); }, [projects, pid]);

  const project = projects.find((p) => p.id === pid);
  const mine = results.filter((r) => r.projectId === pid);

  const run = async () => {
    if (!project) return;
    setBusy(true);
    for (const [fi, file] of files.entries()) {
      const r: DocResult = { id: uid(), projectId: project.id, file: file.name, date: new Date().toISOString(), pages: 0, ocrMs: 0, llmMs: 0, text: "", json: null };
      try {
        const pdf = await openPdf(file);
        r.pages = pdf.numPages;
        const parts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          setStatus(`Documento ${fi + 1}/${files.length} · leyendo página ${i}/${pdf.numPages}`);
          if (project.ocrMode === "texto-pdf") parts.push(await pdf.pageText(i));
          else {
            const res = await ocrPage(project.ocr, project.ocr.prompt, await pdf.renderPage(i, project.ocr.scale));
            r.ocrMs += res.ms;
            parts.push(res.content);
          }
        }
        r.text = parts.map((t, i) => `--- Página ${i + 1} ---\n${t}`).join("\n\n");
        // El documento completo llega al modelo: si no cabe en un fragmento, se analiza por partes.
        const res = await analyzeDocument(project, parts, chat, (m) =>
          setStatus(`Documento ${fi + 1}/${files.length} · ${m}`),
        );
        r.llmMs = res.ms;
        r.json = res.json;
        if (res.fragments.length > 1) r.fragments = res.fragments;
        if (res.schemaRejected) r.schemaRejected = true;
        if (res.warnings.length) r.warnings = res.warnings;
      } catch (e) {
        r.error = e instanceof Error ? e.message : String(e);
        if (e instanceof AnalysisError && e.fragments.length) r.fragments = e.fragments;
      }
      saveResults((prev) => [r, ...prev]);
    }
    setStatus("Proceso terminado.");
    setFiles([]);
    setBusy(false);
  };

  const exportAll = () =>
    download(`${project?.name ?? "proyecto"}.json`, JSON.stringify(mine.map((r) => ({ archivo: r.file, paginas: r.pages, ...(typeof r.json === "object" ? r.json : { resultado: r.json }), ...(r.warnings ? { _avisos: r.warnings } : {}), ...(r.fragments ? { _parciales: r.fragments.map((f) => ({ fragmento: f.fragment, paginas: [f.firstPage, f.lastPage], resultado: f.json })) } : {}), error: r.error })), null, 2));

  const exportCsv = () =>
    project && download(`${project.name}-hallazgos.csv`, findingsCsv(project, mine), "text/csv;charset=utf-8");

  if (!projects.length)
    return <p className="text-muted-foreground">Primero <Link to="/" className="underline">crea un proyecto</Link>.</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-4xl">Procesar PDFs</h1>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proyecto">
            <select className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" value={pid} onChange={(e) => setPid(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Archivos PDF" hint="Se procesan uno tras otro en esta computadora">
            <Input type="file" multiple accept="application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </Field>
        </div>
        {project && (!project.llm.model || (project.ocrMode === "modelo" && !project.ocr.model)) && (
          <p className="mt-3 text-sm text-destructive">Falta indicar el nombre del modelo en la <Link to="/proyectos/$id" params={{ id: project.id }} className="underline">configuración del proyecto</Link>.</p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={run} disabled={busy || !files.length || !project}>{busy ? "Procesando…" : `Procesar ${files.length || ""} PDF`}</Button>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
      </Card>

      <Card title={<div className="flex items-center justify-between">Registros ({mine.length}) {mine.length > 0 && (
        <div className="flex gap-2">
          {project && usesFindings(project) && <Button variant="ghost" onClick={exportCsv}>Hallazgos (CSV)</Button>}
          <Button variant="ghost" onClick={exportAll}>Descargar JSON</Button>
        </div>
      )}</div>}>
        {mine.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay documentos procesados en este proyecto.</p> : (
          <ul className="divide-y divide-border">
            {mine.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button className="text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <span className="font-medium">{r.file}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.pages} pág · OCR {(r.ocrMs / 1000).toFixed(1)} s{r.pages ? ` (${(r.ocrMs / 1000 / r.pages).toFixed(1)} s/pág)` : ""} · análisis {(r.llmMs / 1000).toFixed(1)} s{r.fragments ? ` · ${r.fragments.length} fragmentos` : ""}{findingsSummary(r.json)}
                    </span>
                    {r.error && <span className="ml-2 text-xs text-destructive">{r.error}</span>}
                    {r.warnings && (
                      <span className="ml-2 block text-xs text-destructive">
                        {`Incompleto: ${r.warnings.length} aviso${r.warnings.length === 1 ? "" : "s"}. `}
                        {r.warnings.join(" · ")}
                      </span>
                    )}
                    {r.schemaRejected && (
                      <span className="ml-2 text-xs text-destructive">
                        El servidor no aceptó el esquema JSON; las categorías no quedaron garantizadas.
                      </span>
                    )}
                  </button>
                  <Button variant="danger" onClick={() => saveResults((prev) => prev.filter((x) => x.id !== r.id))}>✕</Button>
                </div>
                {open === r.id && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(r.json, null, 2)}</pre>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{r.text}</pre>
                    {r.fragments && (
                      <details className="lg:col-span-2">
                        <summary className="cursor-pointer text-sm text-muted-foreground">
                          Resultados parciales por fragmento ({r.fragments.length})
                        </summary>
                        <div className="mt-2 grid gap-3 lg:grid-cols-2">
                          {r.fragments.map((f) => (
                            <div key={f.fragment}>
                              <p className="mb-1 text-xs text-muted-foreground">
                                {`Fragmento ${f.fragment} · ${pageRange(f)} · ${(f.ms / 1000).toFixed(1)} s`}
                              </p>
                              <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                                {JSON.stringify(f.json, null, 2)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** " · 12 hallazgos (10 con cita verificada)" o vacío si el registro no tiene hallazgos. */
function findingsSummary(json: unknown) {
  const list = findingsOf(json);
  if (!list.length) return "";
  const ok = list.filter((f) => f["cita_verificada"] === true).length;
  return ` · ${list.length} hallazgo${list.length === 1 ? "" : "s"} (${ok} con cita verificada)`;
}
