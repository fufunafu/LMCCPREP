"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/questions", "Questions"],
  ["/admin/requests", "Access requests"],
  ["/admin/settings", "Settings"],
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="mb-6 flex flex-wrap gap-1 rounded-xl border bg-background p-1 text-sm">
      {items.map(([href, label]) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300")}>{label}</Link>;
      })}
    </nav>
  );
}
