import { useState } from "react";
import { listModels } from "@/lib/local-ai";
import type { Endpoint } from "@/lib/store";
import { Button, Field, Input } from "./ui-lite";

export function EndpointFields({ value, onChange }: { value: Endpoint; onChange: (e: Endpoint) => void }) {
  const [status, setStatus] = useState<string>("");
  const [models, setModels] = useState<string[]>([]);
  const test = async () => {
    setStatus("Probando…");
    try {
      const m = await listModels(value);
      setModels(m);
      setStatus(m.length ? `Conectado: ${m.length} modelo(s) disponible(s)` : "Conectado, sin modelos listados");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "No se pudo conectar");
    }
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Dirección del servidor local" hint="Cualquier servidor compatible con OpenAI en tu PC">
        <Input value={value.baseUrl} onChange={(e) => onChange({ ...value, baseUrl: e.target.value })} />
      </Field>
      <Field label="Nombre del modelo">
        <Input list={`m-${value.baseUrl}`} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} />
        <datalist id={`m-${value.baseUrl}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={test}>Probar conexión</Button>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>
    </div>
  );
}
