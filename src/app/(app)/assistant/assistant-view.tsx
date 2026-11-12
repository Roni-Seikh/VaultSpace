"use client";
import { useRef, useState, type FormEvent } from "react";
import { Bot, Eye, Loader2, SendHorizonal, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, ErrorState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/misc";
import { CategoryIcon } from "@/components/files/file-icons";
import { PreviewDialog } from "@/components/files/preview-dialog";
import { useLibrary } from "@/components/vault/library-provider";
import { useVault } from "@/components/vault/vault-provider";
import { errorMessage } from "@/lib/client/api";
import { downloadDecrypted } from "@/lib/client/transfer";
import type { FileItem } from "@/lib/client/types";
import { parseQuery, pickSummaryTarget, runQuery, type AssistantResult } from "@/lib/assistant/query";
import { extractText } from "@/lib/assistant/extract";
import { summarize } from "@/lib/assistant/summarize";
import { formatBytes, formatDate } from "@/lib/format";

interface Turn {
  id: number; query: string;
  result?: AssistantResult;
  summary?: { file: FileItem; sentences: string[]; note?: string };
  error?: string;
}

const SUGGESTIONS = [
  "Find my college certificates", "Show my PDF files", "Find documents uploaded last week",
  "Search for files with the word project", "Find duplicate photographs", "What are my largest files?",
];

export function AssistantView() {
  const { files, loading, error, refresh } = useLibrary();
  const { vault } = useVault();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<FileItem | null>(null);
  const nextId = useRef(1);

  const patch = (id: number, p: Partial<Turn>) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function summarizeFile(file: FileItem, id: number) {
    if (!vault) return;
    setBusy(true);
    try {
      const { blob } = await downloadDecrypted(file.id, vault);
      const ex = await extractText(blob, file.mimeType);
      if (!ex.ok) { patch(id, { error: ex.reason }); return; }
      const s = summarize(ex.text, 5);
      if (!s) { patch(id, { error: "There isn't enough readable text in this file to summarize." }); return; }
      patch(id, { summary: { file, sentences: s.sentences, note: s.truncated ? "Only the first part of a long document was used." : undefined } });
    } catch (e) {
      patch(id, { error: errorMessage(e) });
    } finally { setBusy(false); }
  }

  async function ask(text: string) {
    const query = text.trim();
    if (!query || busy) return;
    const id = nextId.current++;
    setTurns((t) => [{ id, query }, ...t]);
    setQ("");
    const parsed = parseQuery(query);
    if (parsed.intent === "empty") { patch(id, { error: "Type a question first." }); return; }
    if (parsed.intent === "summarize") {
      const target = pickSummaryTarget(parsed, files);
      if (!target) { patch(id, { error: "I couldn't tell which file you mean. Try \"Summarize <part of the file name>\" or use the Summarize button on a search result." }); return; }
      await summarizeFile(target, id);
      return;
    }
    patch(id, { result: runQuery(parsed, files) });
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void ask(q); };
  const canSummarize = (f: FileItem) => f.mimeType.startsWith("text/") || f.mimeType === "application/pdf";

  const header = <PageHeader title="AI File Assistant" description="Ask in plain language. Everything runs in your browser." />;
  if (loading) return <>{header}<p className="text-sm text-muted">Loading your library…</p></>;
  if (error) return <>{header}<ErrorState message={error} onRetry={refresh} /></>;

  const Row = ({ f }: { f: FileItem }) => (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <CategoryIcon category={f.category} className="h-9 w-9" />
      <div className="min-w-0 flex-1 basis-40"><div className="truncate text-sm font-medium">{f.name}</div><div className="text-xs text-muted">{formatBytes(f.size)} · {formatDate(f.createdAt)}</div></div>
      <Button size="sm" variant="outline" onClick={() => setOpen(f)}><Eye className="h-4 w-4" />Open</Button>
      {canSummarize(f) && <Button size="sm" variant="outline" disabled={busy} onClick={() => { const id = nextId.current++; setTurns((t) => [{ id, query: `Summarize ${f.name}` }, ...t]); void summarizeFile(f, id); }}><Sparkles className="h-4 w-4" />Summarize</Button>}
    </li>
  );

  return (
    <>
      {header}
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-ok/30 bg-ok/10 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
        <p><strong>Private by design.</strong> The assistant works on file names and dates already decrypted in your browser, and summaries are made on your device. No file, name or question is sent to any AI service. Search covers file names, types and dates (not file contents).</p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input aria-label="Ask the assistant" value={q} onChange={(e) => setQ(e.target.value)} placeholder='Try "Find documents uploaded last week"' className="h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-sm" />
        <Button type="submit" size="lg" disabled={!q.trim() || busy} aria-label="Send">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}</Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => void ask(s)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:border-brand/50 hover:text-fg">{s}</button>)}
      </div>

      <div className="mt-6 space-y-4" aria-live="polite">
        {turns.length === 0 && <Card className="flex items-center gap-3 text-sm text-muted"><Bot className="h-5 w-5 text-brand" aria-hidden />Pick a suggestion or type a question to get started.</Card>}
        {turns.map((t) => (
          <Card key={t.id} className="space-y-3">
            <p className="text-sm font-medium">{t.query}</p>
            {t.error && <p role="alert" className="text-sm text-danger">{t.error}</p>}
            {!t.result && !t.summary && !t.error && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Working on your device…</p>}
            {t.result && (
              <>
                <p className="text-sm">{t.result.summary}</p>
                <p className="text-xs text-muted">{t.result.interpretation}{t.result.fuzzy && " (similar-name matches)"}</p>
                {t.result.groups ? (
                  <div className="space-y-3">{t.result.groups.map((g, i) => (
                    <div key={i} className="rounded-xl border border-border px-3"><Badge tone="warn" className="mt-2">Identical files</Badge><ul className="divide-y divide-border">{g.map((f) => <Row key={f.id} f={f} />)}</ul></div>
                  ))}</div>
                ) : t.result.files.length > 0 && <ul className="divide-y divide-border">{t.result.files.map((f) => <Row key={f.id} f={f} />)}</ul>}
              </>
            )}
            {t.summary && (
              <div className="space-y-2">
                <p className="text-sm text-muted">Summary of <strong className="text-fg">{t.summary.file.name}</strong> (key sentences, extracted locally):</p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm">{t.summary.sentences.map((s, i) => <li key={i}>{s}</li>)}</ul>
                {t.summary.note && <p className="text-xs text-muted">{t.summary.note}</p>}
              </div>
            )}
          </Card>
        ))}
      </div>
      <PreviewDialog file={open} onClose={() => setOpen(null)} />
    </>
  );
}
