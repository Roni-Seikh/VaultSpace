"use client";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "./button";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>{children}</NextThemes>;
}

const subscribe = () => () => {};
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false);

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = !mounted ? Monitor : theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <Button variant="ghost" size="icon" aria-label={`Theme: ${mounted ? theme : "system"}. Switch to ${next}`} onClick={() => setTheme(next)}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
