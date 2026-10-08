import { useEffect, useState } from "react";
import type { Category, CategoryValue } from "@/lib/store";
import { TESIS_CATEGORIES } from "@/lib/libro-codigos-tesis";
import { Button, Input, Textarea } from "@/components/ui-lite";

/** Una línea por valor: "valor | definición" (la definición es opcional). */
const toText = (values: CategoryValue[]) =>
  values.map((v) => (v.definition ? `${v.value} | ${v.definition}` : v.value)).join("\n");

const fromText = (text: string): CategoryValue[] =>
  text.split("\n").map((line) => {
    const i = line.indexOf("|");
    return i < 0
      ? { value: line, definition: "" }
      : { value: line.slice(0, i).trimEnd(), definition: line.slice(i + 1).trimStart() };
  });

function ValuesField({
  values,
  onChange,
}: {
  values: CategoryValue[];
  onChange: (v: CategoryValue[]) => void;
}) {
  // Se guarda el texto tal cual se escribe; las líneas vacías y espacios se ignoran al usarlo.
  const [text, setText] = useState(() => toText(values));
  // Si los valores cambian desde fuera (otra categoría eliminada, libro de códigos cargado), se resincroniza.
  useEffect(() => {
    if (JSON.stringify(fromText(text)) !== JSON.stringify(values)) setText(toText(values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);
  return (
    <Textarea
      rows={Math.min(12, Math.max(3, values.length + 1))}
      placeholder={"valor | definición\nvalor | definición"}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(fromText(e.target.value));
      }}
    />
  );
}

export function CategoriesEditor({
  categories,
  onChange,
}: {
  categories: Category[];
  onChange: (c: Category[]) => void;
}) {
  const [notice, setNotice] = useState("");
  const setCat = (i: number, patch: Partial<Category>) =>
    onChange(categories.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const loadTesis = () => {
    const names = new Set(categories.map((c) => c.name.trim()));
    const missing = TESIS_CATEGORIES.filter((c) => !names.has(c.name));
    onChange([...categories, ...structuredClone(missing)]);
    setNotice(
      missing.length
        ? `Se agregaron ${missing.length} categorías. Revísalas y pulsa Guardar.`
        : "Las categorías de la tesis ya estaban cargadas.",
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Listas cerradas: el modelo solo puede elegir entre los valores que escribas. Las de nivel{" "}
        <em>documento</em> se codifican una vez por documento; las de nivel <em>hallazgo</em> se
        codifican en cada afirmación relevante que el modelo encuentre, junto con su cita literal,
        su página y un resumen. La app comprueba después que cada cita aparezca en el texto.
      </p>

      {categories.map((c, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <Input
              placeholder="clave"
              value={c.name}
              onChange={(e) => setCat(i, { name: e.target.value })}
            />
            <select
              className="rounded-md border border-input bg-card px-2 text-sm"
              value={c.level}
              onChange={(e) => setCat(i, { level: e.target.value as Category["level"] })}
            >
              <option value="documento">nivel documento</option>
              <option value="hallazgo">nivel hallazgo</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.multiple}
                onChange={(e) => setCat(i, { multiple: e.target.checked })}
              />
              varios valores
            </label>
            <Button variant="danger" onClick={() => onChange(categories.filter((_, j) => j !== i))}>
              ✕
            </Button>
          </div>
          <Textarea
            rows={2}
            placeholder="descripción e instrucciones para el modelo"
            value={c.description}
            onChange={(e) => setCat(i, { description: e.target.value })}
          />
          <ValuesField values={c.values} onChange={(values) => setCat(i, { values })} />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          onClick={() =>
            onChange([
              ...categories,
              { name: "", description: "", level: "hallazgo", multiple: false, values: [] },
            ])
          }
        >
          + Categoría
        </Button>
        <Button variant="ghost" onClick={loadTesis}>
          Cargar libro de códigos de la tesis
        </Button>
        {notice && <span className="text-sm text-muted-foreground">{notice}</span>}
      </div>
    </div>
  );
}
