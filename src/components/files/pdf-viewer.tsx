"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Renders a PDF onto a <canvas> with pdf.js. JavaScript inside PDFs is never executed
 * (scripting is not enabled), links are not followed, and `eval` support is disabled.
 */
export function PdfViewer({ blob }: { blob: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const doc = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const data = new Uint8Array(await blob.arrayBuffer());
        const loaded = await pdfjs.getDocument({ data, isEvalSupported: false, enableScripting: false } as Parameters<typeof pdfjs.getDocument>[0]).promise;
        if (cancelled) { void loaded.loadingTask.destroy(); return; }
        doc.current = loaded;
        setPages(loaded.numPages);
        setPage(1);
      } catch {
        if (!cancelled) setError("This PDF could not be displayed. You can still download it.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; void doc.current?.loadingTask.destroy(); doc.current = null; };
  }, [blob]);

  useEffect(() => {
    const d = doc.current;
    const c = canvas.current;
    if (!d || !c || pages === 0) return;
    let task: { cancel: () => void } | null = null;
    let stale = false;
    (async () => {
      try {
        const p = await d.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const width = Math.min(c.parentElement?.clientWidth ?? 800, 900);
        const dpr = window.devicePixelRatio || 1;
        const viewport = p.getViewport({ scale: (width / base.width) * dpr });
        c.width = viewport.width; c.height = viewport.height;
        c.style.width = `${viewport.width / dpr}px`; c.style.height = `${viewport.height / dpr}px`;
        const ctx = c.getContext("2d");
        if (!ctx || stale) return;
        const render = p.render({ canvas: c, canvasContext: ctx, viewport });
        task = render;
        await render.promise;
      } catch { /* cancelled or page failed: ignore */ }
    })();
    return () => { stale = true; task?.cancel(); };
  }, [page, pages]);

  if (error) return <p role="alert" className="p-6 text-center text-sm text-danger">{error}</p>;
  return (
    <div className="flex flex-col items-center gap-3">
      {busy && <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading PDF" />}
      <div className="max-w-full overflow-auto rounded-lg border border-border bg-white"><canvas ref={canvas} aria-label={`PDF page ${page} of ${pages}`} /></div>
      {pages > 1 && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-muted" aria-live="polite">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
