"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { Download, FileQuestion, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { Field } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/client/api";
import { decryptBlob } from "@/lib/crypto/chunk-cipher";
import {
  decryptShareName, derivePasswordMaterial, deriveShareWrapKey, parseShareFragment, unwrapFileKeyFromShare,
} from "@/lib/crypto/share-keys";
import { saveBlob } from "@/lib/client/transfer";
import { PREVIEWABLE_MIMES } from "@/lib/files/types";
import { formatBytes, formatDateTime } from "@/lib/format";

const PdfViewer = dynamic(() => import("@/components/files/pdf-viewer").then((m) => m.PdfViewer), { ssr: false });

interface Meta { requiresPassword: boolean; passwordSalt: string | null; canDownload: boolean; mimeType: string; sizeBytes: number; expiresAt: string }
interface Access { url: string; wrappedFileKey: string; nameEnc: string; mimeType: string; sizeBytes: number; canDownload: boolean }
type Stage = "loading" | "missing-key" | "invalid" | "password" | "decrypting" | "ready" | "error";

export function ShareViewer({ token }: { token: string }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [secret, setSecret] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; blob: Blob; url: string | null; text?: string; mime: string; canDownload: boolean } | null>(null);

  const open = useCallback(async (m: Meta, sec: Uint8Array<ArrayBuffer>, pw: string) => {
    setStage("decrypting"); setError(null);
    try {
      let pwKey: Uint8Array<ArrayBuffer> | undefined;
      let gateToken: string | undefined;
      if (m.requiresPassword) {
        const mat = await derivePasswordMaterial(pw, m.passwordSalt ?? "");
        pwKey = mat.pwKey; gateToken = mat.gateToken;
      }
      const access = await api<Access>(`/api/public/shares/${token}/access`, { body: { gateToken } });
      const wrap = await deriveShareWrapKey(sec, pwKey);
      const fileKey = await unwrapFileKeyFromShare(access.wrappedFileKey, wrap);
      const name = await decryptShareName(access.nameEnc, wrap);
      const res = await fetch(access.url);
      if (!res.ok) throw new Error("The file could not be downloaded from storage.");
      const blob = await decryptBlob(await res.blob(), fileKey, { mimeType: access.mimeType });
      const mime = access.mimeType;
      const isText = mime.startsWith("text/");
      const url = PREVIEWABLE_MIMES.has(mime) && !isText && mime !== "application/pdf" ? URL.createObjectURL(blob) : null;
      setFile({ name, blob, url, mime, canDownload: access.canDownload, text: isText ? await blob.slice(0, 200_000).text() : undefined });
      setStage("ready");
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "WRONG_PASSWORD") { setError("Incorrect password."); setStage("password"); }
      else if (e instanceof ApiClientError && (e.code === "SHARE_NOT_FOUND")) setStage("invalid");
      else if (e instanceof ApiClientError && e.code === "RATE_LIMITED") { setError(e.message); setStage(m.requiresPassword ? "password" : "error"); }
      else if ((e as { code?: string }).code === "WRONG_SECRET") { setError(m.requiresPassword ? "Incorrect password, or the link is incomplete." : "This link is incomplete or has been altered."); setStage(m.requiresPassword ? "password" : "error"); }
      else { setError((e as Error).message); setStage("error"); }
    }
  }, [token]);

  useEffect(() => {
    const sec = parseShareFragment(window.location.hash);
    if (!sec) { setStage("missing-key"); return; }
    setSecret(sec);
    api<Meta>(`/api/public/shares/${token}`)
      .then((m) => { setMeta(m); if (m.requiresPassword) setStage("password"); else void open(m, sec, ""); })
      .catch((e) => setStage(e instanceof ApiClientError && e.status === 404 ? "invalid" : "error"));
  }, [token, open]);

  useEffect(() => () => { if (file?.url) URL.revokeObjectURL(file.url); }, [file]);

  const submit = (e: FormEvent) => { e.preventDefault(); if (meta && secret && password) void open(meta, secret, password); };

  return (
    <div className="bg-hero min-h-screen">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8"><Logo /><ThemeToggle /></header>
      <main id="main" className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-6">
        {stage === "loading" && <Loader2 className="mt-20 h-6 w-6 animate-spin text-muted" aria-label="Loading" />}
        {(stage === "invalid" || stage === "missing-key") && (
          <Card className="mt-10 w-full max-w-md space-y-3 p-8 text-center">
            <FileQuestion className="mx-auto h-10 w-10 text-muted" aria-hidden />
            <h1 className="text-xl font-semibold">{stage === "invalid" ? "This link isn't available" : "This link is incomplete"}</h1>
            <p className="text-sm text-muted">{stage === "invalid" ? "It may have expired, been revoked by the owner, or never existed." : "The part of the link after the # sign contains the decryption key. Ask the sender for the full link."}</p>
          </Card>
        )}
        {stage === "password" && (
          <Card className="mt-10 w-full max-w-md space-y-4 p-8">
            <div className="flex items-center gap-3"><Lock className="h-6 w-6 text-brand" aria-hidden /><h1 className="text-xl font-semibold">Password required</h1></div>
            <p className="text-sm text-muted">The owner protected this file with a password.</p>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Password" type="password" autoFocus autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
              <Button type="submit" className="w-full" disabled={!password}>Unlock file</Button>
            </form>
          </Card>
        )}
        {stage === "decrypting" && <div className="mt-20 flex flex-col items-center gap-3 text-sm text-muted"><Loader2 className="h-6 w-6 animate-spin" aria-hidden />Decrypting in your browser…</div>}
        {stage === "error" && <Card className="mt-10 w-full max-w-md p-8 text-center"><h1 className="text-xl font-semibold">Couldn&apos;t open this file</h1><p role="alert" className="mt-2 text-sm text-danger">{error}</p></Card>}
        {stage === "ready" && file && (
          <Card className="mt-6 w-full space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><h1 className="truncate text-xl font-semibold" title={file.name}>{file.name}</h1><p className="text-sm text-muted">{formatBytes(file.blob.size)}{meta && ` · link expires ${formatDateTime(meta.expiresAt)}`}</p></div>
              {file.canDownload && <Button onClick={() => saveBlob(file.blob, file.name)}><Download className="h-4 w-4" />Download</Button>}
            </div>
            <div className="grid min-h-[30vh] place-items-center overflow-auto rounded-xl bg-surface-2 p-3">
              {file.mime.startsWith("image/") && file.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt={file.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
              ) : file.mime.startsWith("video/") && file.url ? (
                <video src={file.url} controls playsInline className="max-h-[70vh] max-w-full rounded-lg" aria-label={file.name} />
              ) : file.mime === "application/pdf" ? (
                <PdfViewer blob={file.blob} />
              ) : file.text !== undefined ? (
                <pre className="max-h-[65vh] w-full overflow-auto whitespace-pre-wrap break-words text-sm">{file.text}</pre>
              ) : (
                <p className="text-center text-sm text-muted">{file.canDownload ? "Preview isn't available for this file type. Use Download to save it." : "Preview isn't available for this file type, and the owner has not allowed downloads."}</p>
              )}
            </div>
            <p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-ok" aria-hidden />Decrypted on your device. The key in this link was never sent to the server.</p>
          </Card>
        )}
      </main>
    </div>
  );
}
