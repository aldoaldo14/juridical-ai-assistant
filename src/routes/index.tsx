import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { newProject, useBenchRuns, useProjects, useResults } from "@/lib/store";
import { Button, Card } from "@/components/ui-lite";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gabinete — Proyectos de investigación jurídica" },
      { name: "description", content: "Procesa PDFs jurídicos con modelos de IA locales en tu propia computadora." },
      { property: "og:title", content: "Gabinete — Proyectos" },
      { property: "og:description", content: "OCR y análisis de artículos jurídicos con modelos locales." },
    ],
  }),
  component: Index,
});

function Index() {
  const [projects, saveProjects] = useProjects();
  const [runs] = useBenchRuns();
  const [results] = useResults();
  const nav = useNavigate();
  const create = () => {
    const p = newProject();
    saveProjects((prev) => [...prev, p]);
    nav({ to: "/proyectos/$id", params: { id: p.id } });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-4xl">Tu gabinete de investigación</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Todo se ejecuta en esta computadora: los PDFs y los resultados no salen de tu equipo.
        </p>
      </header>

      {runs.length === 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <p className="font-medium">Paso 1 recomendado: mide tus modelos antes de decidir cómo trabajar.</p>
          <p className="mt-1 text-sm text-muted-foreground">Aún no hay mediciones registradas en este equipo.</p>
          <Link to="/prueba" className="mt-3 inline-block text-sm font-medium text-primary underline">Ir a la prueba de rendimiento →</Link>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Proyectos</h2>
        <Button onClick={create}>+ Nuevo proyecto</Button>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Crea un proyecto por tema: define qué variables quieres extraer y qué modelos usar.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} to="/proyectos/$id" params={{ id: p.id }} className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary">
              <h3 className="font-serif text-lg">{p.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.topic || "Sin tema"}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {p.variables.length} variables · {results.filter((r) => r.projectId === p.id).length} documentos
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
