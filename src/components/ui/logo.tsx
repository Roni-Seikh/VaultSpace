import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <defs>
        <linearGradient id="vsg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" /><stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#vsg)" />
      <path d="M9 10.5 16 22l7-11.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="9" r="1.8" fill="#fff" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)} aria-label="VaultSpace home">
      <LogoMark />
      <span className="text-lg">VaultSpace</span>
    </Link>
  );
}
