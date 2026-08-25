import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <span className="relative grid size-8 place-items-center rounded-[11px] bg-emerald-600 text-white shadow-sm shadow-emerald-950/15">
        <span className="h-3.5 w-1 rounded-full bg-white" />
        <span className="absolute h-1 w-3.5 rounded-full bg-white" />
      </span>
      {!compact && <span>Montreal QBank</span>}
    </Link>
  );
}
