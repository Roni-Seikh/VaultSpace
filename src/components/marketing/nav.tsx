"use client";
import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { LinkButton, Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
  { href: "#plans", label: "Storage" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="text-sm text-muted transition-colors hover:text-fg">{l.label}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LinkButton href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</LinkButton>
          <LinkButton href="/register" size="sm" className="hidden sm:inline-flex">Get started</LinkButton>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border bg-bg px-4 pb-4 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col py-2">
            {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-3 text-sm hover:bg-surface-2">{l.label}</a>)}
          </nav>
          <div className="flex gap-2">
            <LinkButton href="/login" variant="outline" className="flex-1">Sign in</LinkButton>
            <LinkButton href="/register" className="flex-1">Get started</LinkButton>
          </div>
        </div>
      )}
    </header>
  );
}

export function FooterLinks() {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
      <li><Link href="/login" className="hover:text-fg">Sign in</Link></li>
      <li><Link href="/register" className="hover:text-fg">Create account</Link></li>
      <li><a href="#privacy" className="hover:text-fg">Privacy model</a></li>
      <li><a href="#faq" className="hover:text-fg">FAQ</a></li>
    </ul>
  );
}
