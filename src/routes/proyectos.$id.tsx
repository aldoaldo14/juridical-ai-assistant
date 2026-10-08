import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Project, type Variable, useProjects } from "@/lib/store";
import { Button, Card, Field, Input, Textarea } from "@/components/ui-lite";
import { EndpointFields } from "@/components/EndpointFields";
import { CategoriesEditor } from "@/components/CategoriesEditor";

export const Route = createFileRoute("/proyectos/$id")({
  head: () => ({
    meta: [
      { title: "Configurar proyecto — Gabinete" },
      { name: "description", content: "Variables, modelos y servidores locales del proyecto." },
      { property: "og:title", content: "Configurar proyecto — Gabinete" },
      { property: "og:description", content: "Ajusta el proyecto de investigación." },
    ],
  }),
  component: ProjectPage,
});

const TYPES: Variable["type"][] = ["texto", "número", "fecha", "lista", "sí/no"];

function ProjectPage() {
  const { id } = Route.useParams();
  const [projects, save] = useProjects();
  const nav = useNavigate();
  const stored = projects.find((p) => p.id === id);
  const [p, setP] = useState<Project | undefined>(stored);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (stored && !p) setP(stored); }, [stored, p]);

  if (!p) return <p className="text-muted-foreground">Proyecto no encontrado. <Link to="/" className="underline">Volver</Link></p>;

  const set = (patch: Partial<Project>) => { setP({ ...p, ...patch }); setSaved(false); };
  const setVar = (i: number, patch: Partial<Variable>) => set({ variables: p.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const persist = () => { save((prev) => prev.map((x) => (x.id === p.id ? p : x))); setSaved(true); };
  const remove = () => {
    if (!confirm("¿Eliminar este proyecto?")) return;
    save((prev) => prev.filter((x) => x.id !== p.id));
    nav({ to: "/" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">{p.name}</h1>
        <div className="flex gap-2">
          <Button variant="danger" onClick={remove}>Eliminar</Button>
          <Button variant="ghost" onClick={() => nav({ to: "/procesar", search: { proyecto: p.id } })}>Procesar PDFs</Button>
          <Button onClick={persist}>{saved ? "Guardado ✓" : "Guardar"}</Button>
        </div>
      </div>

      <Card title="Tema">
        <div className="grid gap-3">
          <Field label="Nombre"><Input value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Tema o pregunta de investigación" hint="Se incluye en las instrucciones al modelo de análisis">
            <Textarea rows={2} value={p.topic} onChange={(e) => set({ topic: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card title="Variables a extraer (registro JSON)">
        <div className="space-y-2">
          {p.variables.map((v, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
              <Input placeholder="clave" value={v.name} onChange={(e) => setVar(i, { name: e.target.value })} />
              <Input placeholder="descripción" value={v.description} onChange={(e) => setVar(i, { description: e.target.value })} />
              <select className="rounded-md border border-input bg-card px-2 text-sm" value={v.type} onChange={(e) => setVar(i, { type: e.target.value as Variable["type"] })}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <Button variant="danger" onClick={() => set({ variables: p.variables.filter((_, j) => j !== i) })}>✕</Button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => set({ variables: [...p.variables, { name: "", description: "", type: "texto" }] })}>+ Variable</Button>
        </div>
      </Card>

      <Card title="Categorías (libro de códigos)">
        <CategoriesEditor categories={p.categories ?? []} onChange={(categories) => set({ categories })} />
      </Card>

      <Card title="Paso 1 · Lectura de páginas (OCR)">
        <div className="mb-4 flex gap-4 text-sm">
          {(["modelo", "texto-pdf"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input type="radio" checked={p.ocrMode === m} onChange={() => set({ ocrMode: m })} />
              {m === "modelo" ? "Usar modelo de visión (escaneos)" : "Usar texto incrustado del PDF (sin modelo, más rápido)"}
            </label>
          ))}
        </div>
        {p.ocrMode === "modelo" && (
          <div className="space-y-3">
            <EndpointFields value={p.ocr} onChange={(e) => set({ ocr: { ...p.ocr, ...e } })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Instrucción de OCR"><Input value={p.ocr.prompt} onChange={(e) => set({ ocr: { ...p.ocr, prompt: e.target.value } })} /></Field>
              <Field label="Resolución de página" hint="1 = rápida, 2 = estándar, 3 = letra pequeña">
                <Input type="number" min={1} max={4} step={0.5} value={p.ocr.scale} onChange={(e) => set({ ocr: { ...p.ocr, scale: Number(e.target.value) } })} />
              </Field>
            </div>
          </div>
        )}
      </Card>

      <Card title="Paso 2 · Codificación y relaciones">
        <div className="space-y-3">
          <EndpointFields value={p.llm} onChange={(e) => set({ llm: { ...p.llm, ...e } })} />
          <Field label="Instrucciones al modelo"><Textarea rows={5} value={p.llm.systemPrompt} onChange={(e) => set({ llm: { ...p.llm, systemPrompt: e.target.value } })} /></Field>
          <Field label="Máximo de caracteres por fragmento" hint="Los documentos más largos se dividen en fragmentos de páginas completas, se codifican por partes y se consolidan al final. Ajústalo según el contexto con que cargues el modelo (mínimo 2000).">
            <Input type="number" value={p.llm.maxChars} onChange={(e) => set({ llm: { ...p.llm, maxChars: Number(e.target.value) } })} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={p.llm.strictJson !== false} onChange={(e) => set({ llm: { ...p.llm, strictJson: e.target.checked } })} />
            <span>
              Exigir el formato con esquema JSON (recomendado)
              <span className="block text-xs text-muted-foreground">El servidor obliga al modelo a responder con las claves y los valores de categoría definidos. Si el servidor no lo admite, la app repite la solicitud sin esquema y lo indica en el resultado.</span>
            </span>
          </label>
        </div>
      </Card>
    </div>
  );
}
