"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { downloadDecrypted, saveBlob } from "@/lib/client/transfer";
import { errorMessage } from "@/lib/client/api";
import { PREVIEWABLE_MIMES } from "@/lib/files/types";
import { formatBytes } from "@/lib/format";
import type { FileItem } from "@/lib/client/types";

const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), { ssr: false });

type Loaded = { blob: Blob; url: string; text?: string };

/** Decrypts in the browser, then shows only whitelisted types. Nothing from the file is ever executed. */
export function PreviewDialog({ file, onClose }: { file: FileItem | null; onClose: () => void }) {
  const { vault } = useVault();
  const toast = useToast();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!file || !vault) return;
    let cancelled = false;
    let url: string | null = null;
    setLoaded(null); setError(null); setProgress(0);
    (async () => {
      try {
        const { blob } = await downloadDecrypted(file.id, vault, { onProgress: setProgress });
        if (cancelled) return;
        const previewable = PREVIEWABLE_MIMES.has(file.mimeType);
        url = previewable && file.mimeType !== "application/pdf" && !file.mimeType.startsWith("text/") ? URL.createObjectURL(blob) : "";
        const text = file.mimeType.startsWith("text/") ? (await blob.slice(0, 200_000).text()) : undefined;
        if (!cancelled) setLoaded({ blob, url, text });
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file, vault]);

  const save = () => { if (loaded && file) { saveBlob(loaded.blob, file.name); toast.success("Decrypted and saved."); } };

  return (
    <Dialog
      open={!!file} onClose={onClose} size="xl" title={file?.name ?? ""}
      description={file ? `${formatBytes(file.size)} · decrypted only in this browser` : undefined}
      footer={<Button onClick={save} disabled={!loaded}><Download className="h-4 w-4" />Download</Button>}
    >
      {file && (
        <div className="grid min-h-[40vh] place-items-center">
          {error ? (
            <p role="alert" className="text-center text-sm text-danger">{error}</p>
          ) : !loaded ? (
            <div className="flex flex-col items-center gap-2 text-sm text-muted"><Loader2 className="h-6 w-6 animate-spin" aria-hidden />Decrypting… {progress > 0 && `${Math.round(progress * 100)}%`}</div>
          ) : file.mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loaded.url} alt={file.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
          ) : file.mimeType.startsWith("video/") ? (
            <video src={loaded.url} controls playsInline className="max-h-[70vh] max-w-full rounded-lg" aria-label={file.name} />
          ) : file.mimeType === "application/pdf" ? (
            <PdfViewer blob={loaded.blob} />
          ) : loaded.text !== undefined ? (
            <pre className="max-h-[65vh] w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-4 text-sm">{loaded.text}</pre>
          ) : (
            <p className="text-center text-sm text-muted">Preview is not available for this file type. Download it to open it on your device.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
