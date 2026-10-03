// Browser-only: imported dynamically so the server never loads pdf.js.
export async function openPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  return {
    numPages: doc.numPages,
    async renderPage(n: number, scale = 2): Promise<string> {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      return canvas.toDataURL("image/jpeg", 0.9);
    },
    async pageText(n: number): Promise<string> {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      return tc.items.map((i) => ("str" in i ? i.str : "")).join(" ");
    },
  };
}
