import type { Metadata } from "next";

// Share pages: never indexed, never leak the URL (with its #key) through the Referer header.
export const metadata: Metadata = {
  title: "Shared file",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
