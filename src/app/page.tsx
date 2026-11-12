import { ArrowRight, Bot, Check, Eye, FileLock2, FolderTree, History, KeyRound, Link2, Lock, ScanSearch, ServerOff, Share2, ShieldCheck, Upload } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Card } from "@/components/ui/misc";
import { MarketingNav, FooterLinks } from "@/components/marketing/nav";
import { Reveal } from "@/components/marketing/reveal";
import { HeroIllustration } from "@/components/marketing/hero-illustration";

const FEATURES = [
  { icon: FileLock2, title: "Encrypted before upload", body: "Every file is sealed with AES-256-GCM in your browser. Our storage only ever holds ciphertext." },
  { icon: FolderTree, title: "Organised your way", body: "Folders, drag-and-drop uploads, bulk actions, search, sorting and grid or list views." },
  { icon: Share2, title: "Private sharing", body: "Share links with expiry, optional password and view-only mode. Revoke any time." },
  { icon: History, title: "Version history", body: "Upload new versions, restore an older one, or delete versions you no longer need." },
  { icon: ScanSearch, title: "Local AI search", body: "Find files in plain language. It runs on your device, so nothing is sent to an AI service." },
  { icon: ShieldCheck, title: "Security center", body: "See sessions and security events, turn on two-factor authentication, and sign out other devices." },
];

const STEPS = [
  { icon: KeyRound, title: "Create a vault passphrase", body: "A passphrase only you know protects your keys. You also get a recovery key to keep safe." },
  { icon: Lock, title: "Files are encrypted on your device", body: "Each file gets its own random key. Names are encrypted too." },
  { icon: Upload, title: "Only ciphertext is stored", body: "Your browser uploads straight to private storage with a short-lived, single-use link." },
  { icon: Eye, title: "Decrypted only for you", body: "When you open a file it is downloaded and decrypted locally, in your browser." },
];

const FAQ = [
  { q: "Can VaultSpace staff read my files?", a: "No. Files and file names are encrypted in your browser using keys we never receive. We can see metadata such as file sizes, upload times and who a link was shared by, but not contents or names." },
  { q: "What if I forget my passphrase?", a: "Use your recovery key to set a new one. If you lose both the passphrase and the recovery key, your files cannot be recovered by anyone, including us. That is the trade-off of real end-to-end encryption." },
  { q: "Is this really zero-knowledge?", a: "File contents and names are end-to-end encrypted. We do not claim full zero-knowledge, because the server still sees account email, file sizes, timestamps and sharing relationships. The privacy section explains exactly what is and is not visible." },
  { q: "How much storage do I get?", a: "Each account gets 1 GB. VaultSpace runs on free-tier infrastructure with a fixed overall capacity, so new uploads may be paused when the whole service is full. You are never charged." },
  { q: "Is a shared link safe?", a: "The decryption key lives in the part of the link after the # sign, which browsers never send to servers. Anyone who has the full link can open the file until it expires or you revoke it, so share it only with people you trust." },
  { q: "Does the AI assistant send my files anywhere?", a: "No. Search and summaries run in your browser on already-decrypted data. There is no external AI service in this app." },
  { q: "Which files can I upload?", a: "Images (JPG, PNG, WEBP, GIF), videos (MP4, MOV, WEBM), PDF, Word, Excel, PowerPoint, text and CSV files, and ZIP, 7z, RAR and GZ archives. Executables and scripts are blocked, and file contents are checked against the file extension." },
];

export default function Home() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <MarketingNav />
      <main id="main">
        {/* Hero */}
        <section className="bg-hero">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
            <Reveal>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" aria-hidden />End-to-end encrypted cloud storage
              </p>
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Your files deserve <span className="text-gradient">better protection</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">VaultSpace encrypts everything in your browser before it is uploaded, so only you can read your photos, videos and documents. Your files. Your privacy. Your space.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="/register" size="lg">Get started free<ArrowRight className="h-4 w-4" /></LinkButton>
                <LinkButton href="#features" variant="outline" size="lg">Explore features</LinkButton>
                <LinkButton href="/login" variant="ghost" size="lg">Sign in</LinkButton>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                {["1 GB free per account", "No credit card", "Keys never leave your device"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-ok" aria-hidden />{t}</li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1}><HeroIllustration /></Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <Reveal className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">Everything a private drive needs</h2>
            <p className="mt-3 text-muted">Familiar tools, built around privacy rather than bolted on afterwards.</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 0.04}>
                <Card className="h-full transition-colors hover:border-brand/50">
                  <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand"><Icon className="h-5 w-5" aria-hidden /></div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-y border-border bg-surface/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal className="mb-12 max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">How VaultSpace works</h2>
              <p className="mt-3 text-muted">Four steps, and the important ones happen on your device.</p>
            </Reveal>
            <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 0.05}>
                  <li className="h-full rounded-2xl border border-border bg-surface p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-fg">{i + 1}</span>
                      <Icon className="h-5 w-5 text-brand" aria-hidden />
                    </div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm text-muted">{body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight">Privacy you can verify, explained honestly</h2>
              <p className="mt-3 text-muted">We would rather tell you precisely what is protected than make a vague promise.</p>
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
                <ServerOff className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <p className="text-sm text-muted">Your vault passphrase is turned into a key with <strong className="text-fg">Argon2id</strong> inside your browser. That key unwraps a master key, which unwraps a separate key for every file. Nothing here is ever sent to us in readable form.</p>
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
                <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <p className="text-sm text-muted">Share links keep the key after the <code className="rounded bg-surface-2 px-1">#</code>, a part of the address browsers never transmit. We store only a hash of the link token.</p>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-ok"><Lock className="h-4 w-4" aria-hidden />Protected</h3>
                  <ul className="space-y-2 text-sm text-muted">
                    <li>File contents</li><li>File and folder names</li><li>Your passphrase and keys</li><li>Shared file keys</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-warn"><Eye className="h-4 w-4" aria-hidden />Visible to the server</h3>
                  <ul className="space-y-2 text-sm text-muted">
                    <li>Account email</li><li>File sizes and categories</li><li>Upload and access times</li><li>Which files are shared</li>
                  </ul>
                </Card>
              </div>
              <p className="mt-4 text-sm text-muted">Because the server cannot read your files, it also cannot scan them for malware. VaultSpace checks file types in your browser and never runs or renders uploaded content on its servers.</p>
            </Reveal>
          </div>
        </section>

        {/* Plans */}
        <section id="plans" className="scroll-mt-20 border-y border-border bg-surface/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal className="mb-12 max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">Simple storage, no surprise bills</h2>
              <p className="mt-3 text-muted">VaultSpace is built on free-tier infrastructure, so there are no paid plans and nothing is ever charged.</p>
            </Reveal>
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Reveal>
                <Card className="h-full border-brand/50 ring-1 ring-brand/30">
                  <div className="text-sm font-medium text-brand">Free</div>
                  <div className="mt-2 text-4xl font-semibold">1 GB</div>
                  <p className="mt-1 text-sm text-muted">per account</p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {["End-to-end encryption", "Sharing links with expiry", "Version history", "Local AI search"].map((t) => (
                      <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-ok" aria-hidden />{t}</li>
                    ))}
                  </ul>
                  <LinkButton href="/register" className="mt-6 w-full">Create free account</LinkButton>
                </Card>
              </Reveal>
              <Reveal delay={0.05}>
                <Card className="h-full">
                  <div className="text-sm font-medium text-muted">Self-hosted</div>
                  <div className="mt-2 text-4xl font-semibold">Your limits</div>
                  <p className="mt-1 text-sm text-muted">run it yourself</p>
                  <p className="mt-5 text-sm text-muted">VaultSpace is open source. Deploy it with your own Supabase and Cloudflare R2 accounts and set quotas to whatever your own storage allows.</p>
                </Card>
              </Reveal>
            </div>
            <p className="mt-6 max-w-3xl text-sm text-muted">Fair-use note: total capacity across all users is limited. If the service is full, uploads pause until space frees up. Existing files stay accessible.</p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
          <Reveal className="mb-8"><h2 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h2></Reveal>
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}<span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-br from-brand to-brand-2 p-10 text-center text-white">
            <Bot className="h-8 w-8" aria-hidden />
            <h2 className="text-2xl font-semibold">Ready to take your files back?</h2>
            <p className="max-w-md text-white/85">Create a free account in a minute. Your vault passphrase stays with you.</p>
            <LinkButton href="/register" variant="secondary" size="lg" className="bg-white text-slate-900 hover:bg-white/90">Get started</LinkButton>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2"><Logo /><p className="text-sm text-muted">Your files. Your privacy. Your space.</p></div>
          <FooterLinks />
        </div>
        <div className="border-t border-border py-4 text-center text-xs text-muted">© {new Date().getFullYear()} VaultSpace. Open-source portfolio project (MIT).</div>
      </footer>
    </>
  );
}
