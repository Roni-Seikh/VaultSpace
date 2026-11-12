"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot, FileText, FolderOpen, Image as ImageIcon, LayoutDashboard, LockKeyhole, LogOut, Menu, Settings, Share2,
  ShieldAlert, ShieldCheck, X,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme";
import { useTheme } from "next-themes";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { api } from "@/lib/client/api";
import type { Profile } from "@/lib/client/types";
import { formatBytes, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VaultProvider, useVault } from "@/components/vault/vault-provider";
import { LibraryProvider, useLibrary } from "@/components/vault/library-provider";
import { VaultGate } from "@/components/vault/vault-gate";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/files", label: "My Files", icon: FolderOpen },
  { href: "/gallery", label: "Gallery", icon: ImageIcon },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/shared", label: "Shared links", icon: Share2 },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
  { href: "/security", label: "Security", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const ProfileCtx = createContext<{ profile: Profile | null; reload: () => Promise<void> }>({ profile: null, reload: async () => {} });
export const useProfile = () => useContext(ProfileCtx);

function StorageMeter() {
  const { storage } = useLibrary();
  if (!storage) return null;
  const pct = percent(storage.usedBytes + storage.reservedBytes, storage.quotaBytes);
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Storage</span>
        <span className="text-muted">{pct.toFixed(0)}%</span>
      </div>
      <Progress value={pct} label="Storage used" />
      <p className="text-xs text-muted">{formatBytes(storage.usedBytes)} of {formatBytes(storage.quotaBytes)} used</p>
    </div>
  );
}

function Sidebar({ admin, onNavigate }: { admin: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const items = admin ? [...NAV, { href: "/admin", label: "Admin", icon: ShieldAlert }] : NAV;
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="px-1 pt-1"><Logo href="/dashboard" /></div>
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-brand/15 text-brand" : "text-muted hover:bg-surface-2 hover:text-fg")}>
              <Icon className="h-4.5 w-4.5" aria-hidden />{label}
            </Link>
          );
        })}
      </nav>
      <StorageMeter />
    </div>
  );
}

function Topbar({ onMenu, profile }: { onMenu: () => void; profile: Profile | null }) {
  const router = useRouter();
  const { lock, status } = useVault();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    lock();
    await api("/api/security/event", { body: { type: "logout" } }).catch(() => undefined);
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu" onClick={onMenu}><Menu className="h-5 w-5" /></Button>
      <div className="flex-1" />
      {status === "unlocked" && (
        <Button variant="outline" size="sm" onClick={lock} aria-label="Lock vault"><LockKeyhole className="h-4 w-4" /><span className="hidden sm:inline">Lock vault</span></Button>
      )}
      <ThemeToggle />
      <span className="hidden max-w-[14rem] truncate text-sm text-muted md:inline" title={profile?.email}>{profile?.displayName || profile?.email}</span>
      <Button variant="ghost" size="sm" onClick={signOut} loading={busy} aria-label="Sign out"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></Button>
    </header>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { setTheme } = useTheme();
  const path = usePathname();

  const load = useCallback(async () => {
    try {
      const r = await api<{ profile: Profile }>("/api/settings");
      setProfile(r.profile);
      return r.profile;
    } catch { return null; }
  }, []);

  useEffect(() => {
    void load().then((p) => { if (p?.theme) setTheme(p.theme); });
  }, [load, setTheme]);

  useEffect(() => { setOpen(false); }, [path]);

  return (
    <ProfileCtx.Provider value={{ profile, reload: async () => { await load(); } }}>
      <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
        <aside className="sticky top-0 hidden h-screen border-r border-border bg-surface lg:block"><Sidebar admin={profile?.role === "admin"} /></aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <button className="absolute inset-0 bg-black/50" aria-label="Close navigation menu" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-surface shadow-xl">
              <Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
              <Sidebar admin={profile?.role === "admin"} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}
        <div className="min-w-0">
          <Topbar onMenu={() => setOpen(true)} profile={profile} />
          <main id="main" className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
            <VaultGate>{children}</VaultGate>
          </main>
        </div>
      </div>
    </ProfileCtx.Provider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <VaultProvider>
      <LibraryProvider>
        <Frame>{children}</Frame>
      </LibraryProvider>
    </VaultProvider>
  );
}
