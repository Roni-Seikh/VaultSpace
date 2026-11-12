import { FileText, Image as ImageIcon, Lock, ShieldCheck, Video } from "lucide-react";

/** Decorative product illustration drawn with markup (not a real screenshot, not interactive). */
export function HeroIllustration() {
  const rows = [
    { icon: ImageIcon, name: "Holiday-photos.zip", tag: "Encrypted", color: "text-brand" },
    { icon: FileText, name: "Certificates.pdf", tag: "Encrypted", color: "text-brand-2" },
    { icon: Video, name: "Graduation.mp4", tag: "Encrypted", color: "text-brand" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-xl select-none" role="img" aria-label="Illustration of the VaultSpace file list with encrypted files">
      <div className="absolute -inset-2 sm:-inset-6 rounded-[2rem] bg-gradient-to-tr from-brand/25 via-brand-2/20 to-transparent blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl shadow-brand/10">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-danger/70" /><span className="h-3 w-3 rounded-full bg-warn/70" /><span className="h-3 w-3 rounded-full bg-ok/70" />
          <div className="ml-3 flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1 text-xs text-muted"><Lock className="h-3 w-3" />vaultspace.app/files</div>
        </div>
        <div className="grid grid-cols-[9rem_1fr]">
          <div className="hidden space-y-1.5 border-r border-border p-3 sm:block">
            {["Dashboard", "My Files", "Gallery", "Shared", "Security"].map((l, i) => (
              <div key={l} className={`rounded-lg px-2.5 py-1.5 text-xs ${i === 1 ? "bg-brand/15 font-medium text-brand" : "text-muted"}`}>{l}</div>
            ))}
            <div className="mt-6 rounded-lg bg-surface-2 p-2.5">
              <div className="mb-1.5 text-[10px] text-muted">Storage</div>
              <div className="h-1.5 rounded-full bg-border"><div className="h-full w-1/3 rounded-full bg-brand" /></div>
            </div>
          </div>
          <div className="col-span-2 space-y-2 p-4 sm:col-span-1">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">My Files</div>
              <div className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-brand-fg">Upload</div>
            </div>
            {rows.map(({ icon: Icon, name, tag, color }) => (
              <div key={name} className="flex items-center gap-3 rounded-xl border border-border bg-bg/60 p-3">
                <div className={`grid h-9 w-9 place-items-center rounded-lg bg-surface-2 ${color}`}><Icon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{name}</div><div className="text-xs text-muted">AES-256-GCM</div></div>
                <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-medium text-ok"><ShieldCheck className="h-3 w-3" />{tag}</span>
              </div>
            ))}
            <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">Drop files here · encrypted before they leave your device</div>
          </div>
        </div>
      </div>
    </div>
  );
}
