"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleGauge, FileQuestion, Settings2, TicketCheck, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Overview", icon: CircleGauge },
  { href: "/admin/users", label: "Users", icon: UsersRound },
  { href: "/admin/questions", label: "Questions", icon: FileQuestion },
  { href: "/admin/requests", label: "Access requests", icon: TicketCheck },
  { href: "/admin/settings", label: "Settings", icon: Settings2 },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="-mx-4 mb-7 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <nav aria-label="Admin sections" className="flex w-max min-w-full gap-1 rounded-xl border bg-background p-1 text-sm shadow-xs">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", active && "bg-emerald-50 text-emerald-800 shadow-xs dark:bg-emerald-950/50 dark:text-emerald-300")}><Icon className="size-4" aria-hidden="true" />{label}</Link>;
      })}
      </nav>
    </div>
  );
}
