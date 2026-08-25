"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";

  return (
    <Button variant="ghost" size={showLabel ? "default" : "icon"} aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}{showLabel && <span>{dark ? "Light mode" : "Dark mode"}</span>}
    </Button>
  );
}
