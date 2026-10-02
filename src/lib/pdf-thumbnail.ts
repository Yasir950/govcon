"use client";

// Renders the first page of a PDF the admin just picked to a PNG, in the
// browser, for the resource card thumbnail. Returns null (no thumbnail)
// for anything pdf.js can't open — never blocks the upload.
export async function pdfFirstPageThumbnail(file: File, width = 640): Promise<Blob | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      // Card thumbnails are landscape-ish; keep the top of a tall page.
      canvas.height = Math.round(Math.min(viewport.height, viewport.width * 1.3));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      await doc.destroy();
    }
  } catch (err) {
    console.warn("PDF thumbnail failed", err);
    return null;
  }
}
