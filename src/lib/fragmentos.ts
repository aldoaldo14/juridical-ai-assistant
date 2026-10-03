// División del texto de un documento en fragmentos para el modelo de análisis.
// Las páginas no se parten, salvo que una sola supere el límite.

export type Fragment = {
  index: number; // 1 = primer fragmento
  firstPage: number;
  lastPage: number;
  text: string;
};

/** Por debajo de este tamaño un fragmento no deja espacio útil para el texto. */
export const MIN_FRAGMENT_CHARS = 2000;

export const fragmentLimit = (maxChars: number) =>
  Math.max(MIN_FRAGMENT_CHARS, Math.floor(maxChars) || 0);

const header = (page: number, part?: number) =>
  part ? `--- Página ${page} (parte ${part}) ---` : `--- Página ${page} ---`;

export const pageRange = (f: { firstPage: number; lastPage: number }) =>
  f.firstPage === f.lastPage ? `página ${f.firstPage}` : `páginas ${f.firstPage}–${f.lastPage}`;

/**
 * Parte un texto en trozos de hasta `limit` caracteres sin perder ninguno.
 * Corta, en este orden de preferencia, en párrafo, salto de línea, fin de oración o espacio.
 */
export function splitLongText(text: string, limit: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const win = rest.slice(0, limit);
    const candidates = [
      win.lastIndexOf("\n\n") + 2,
      win.lastIndexOf("\n") + 1,
      win.lastIndexOf(". ") + 2,
      win.lastIndexOf(" ") + 1,
    ];
    // Un corte demasiado temprano dejaría trozos minúsculos: se exige al menos medio límite.
    const cut = candidates.find((c) => c >= limit / 2) ?? limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length || !out.length) out.push(rest);
  return out;
}

/**
 * Agrupa las páginas en fragmentos de hasta `maxChars` caracteres.
 * Siempre devuelve al menos un fragmento, aunque el documento esté vacío.
 */
export function splitIntoFragments(pages: string[], maxChars: number): Fragment[] {
  const limit = fragmentLimit(maxChars);

  const blocks: { page: number; text: string }[] = [];
  pages.forEach((text, i) => {
    const page = i + 1;
    const whole = `${header(page)}\n${text}`;
    if (whole.length <= limit) {
      blocks.push({ page, text: whole });
      return;
    }
    const room = limit - header(page, 999).length - 1;
    splitLongText(text, room).forEach((part, k) =>
      blocks.push({ page, text: `${header(page, k + 1)}\n${part}` }),
    );
  });

  const fragments: Fragment[] = [];
  let current: { page: number; text: string }[] = [];
  let size = 0;
  const flush = () => {
    const first = current[0];
    const last = current[current.length - 1];
    if (!first || !last) return;
    fragments.push({
      index: fragments.length + 1,
      firstPage: first.page,
      lastPage: last.page,
      text: current.map((b) => b.text).join("\n\n"),
    });
    current = [];
    size = 0;
  };
  for (const block of blocks) {
    const added = block.text.length + (current.length ? 2 : 0);
    if (current.length && size + added > limit) flush();
    size += block.text.length + (current.length ? 2 : 0);
    current.push(block);
  }
  flush();

  return fragments.length ? fragments : [{ index: 1, firstPage: 0, lastPage: 0, text: "" }];
}
