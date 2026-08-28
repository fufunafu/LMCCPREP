import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const toneStyles = {
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
} as const;

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  tone?: keyof typeof toneStyles;
}) {
  const card = (
    <Card className={cn("h-full transition duration-200", href && "group-hover:-translate-y-0.5 group-hover:ring-emerald-600/40")}>
      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          {Icon ? <span className={cn("grid size-9 place-items-center rounded-lg", toneStyles[tone])}><Icon className="size-4" aria-hidden="true" /></span> : <span />}
          {href ? <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-emerald-700" aria-hidden="true" /> : null}
        </div>
        <p className="mt-4 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{value}</p>
        <p className="mt-1 text-sm font-medium">{label}</p>
        {hint ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );

  if (!href) return card;
  return <Link href={href} className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">{card}</Link>;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}
