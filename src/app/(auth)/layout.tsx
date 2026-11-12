import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-hero flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/" className="text-sm text-muted hover:text-fg">Back to home</Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16">{children}</main>
    </div>
  );
}
