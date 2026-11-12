/** Extract plain text from a decrypted file (browser only). Only text and PDF files are supported. */
export type Extracted = { ok: true; text: string; pages?: number } | { ok: false; reason: string };

export async function extractText(blob: Blob, mimeType: string): Promise<Extracted> {
  if (mimeType.startsWith("text/")) {
    return { ok: true, text: await blob.slice(0, 1_000_000).text() };
  }
  if (mimeType === "application/pdf") {
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false } as Parameters<typeof pdfjs.getDocument>[0]).promise;
      const limit = Math.min(doc.numPages, 40);
      let text = "";
      for (let i = 1; i <= limit; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
        if (text.length > 400_000) break;
      }
      void doc.loadingTask.destroy();
      if (text.trim().length < 40) return { ok: false, reason: "This PDF has no selectable text (it may be a scanned image), so I can't summarize it." };
      return { ok: true, text, pages: doc.numPages };
    } catch {
      return { ok: false, reason: "I couldn't read this PDF." };
    }
  }
  return { ok: false, reason: "I can summarize text files and PDFs. Word, Excel and PowerPoint files aren't supported yet." };
}
