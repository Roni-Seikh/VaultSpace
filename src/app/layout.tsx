import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "VaultSpace — Your Private Digital Universe", template: "%s · VaultSpace" },
  description: "VaultSpace is a privacy-first cloud storage platform. Files are encrypted in your browser before they ever leave your device.",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f8fc" }, { media: "(prefers-color-scheme: dark)", color: "#070c18" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
