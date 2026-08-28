"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/requests", label: "Access requests" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="-mx-4 mb-8 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <nav aria-label="Admin sections" className="flex w-max gap-6 text-sm">
      {items.map(({ href, label }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("-mb-px shrink-0 border-b-2 border-transparent px-0.5 py-3 font-medium text-muted-foreground transition-colors hover:text-foreground", active && "border-emerald-700 text-foreground dark:border-emerald-400")}>{label}</Link>;
      })}
      </nav>
    </div>
  );
}
