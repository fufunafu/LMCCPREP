"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpenText, CalendarClock, CircleHelp, GraduationCap, LayoutDashboard, PlusCircle, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { ExamSwitcher } from "@/components/exam-switcher";
import type { Exam } from "@/lib/types";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "New session", icon: PlusCircle },
  { href: "/questions", label: "Questions", icon: BookOpenText },
  { href: "/stats", label: "Statistics", icon: BarChart3 },
  { href: "/coaching/bookings", label: "Coaching", icon: GraduationCap },
  { href: "/settings", label: "Settings", icon: Settings },
];

function activePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href) || (href === "/create" && pathname.startsWith("/session"));
}

export function AppShell({ children, user, demo = false, admin = false, tutor = false, exams = [], currentExamId = "" }: { children: React.ReactNode; user?: { name: string; email: string; streakDays?: number }; demo?: boolean; admin?: boolean; tutor?: boolean; exams?: Exam[]; currentExamId?: string }) {
  const navItems = [...items, ...(tutor ? [{ href: "/coaching/tutor", label: "Tutor", icon: CalendarClock }] : []), ...(admin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : [])];
  const initials = (user?.name ?? "LP").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r bg-background md:flex">
        <div className="flex h-20 items-center px-6"><Logo className="text-lg" /></div>
        {exams.length > 1 && <div className="mb-3 px-4"><p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Studying for</p><ExamSwitcher exams={exams} currentExamId={currentExamId} disabled={demo} /></div>}
        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={activePath(pathname, href) ? "page" : undefined} className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", activePath(pathname, href) && "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300")}>
              <Icon className="size-[18px]" />{label}
            </Link>
          ))}
        </nav>
        <div className="m-3 rounded-2xl border bg-gradient-to-br from-emerald-50 to-cyan-50 p-4 dark:from-emerald-950/60 dark:to-cyan-950/40">
          <div className="mb-2 grid size-8 place-items-center rounded-lg bg-emerald-600 text-white"><Sparkles className="size-4" /></div>
          <p className="text-sm font-semibold">{user?.streakDays ?? 0} day streak</p><p className="mt-1 text-xs leading-5 text-muted-foreground">A few questions today keeps your momentum going.</p>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-4">
          <div className="flex items-center gap-2.5"><div className="grid size-8 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{initials}</div><div><p className="text-xs font-medium">{user?.name ?? "Learner"}</p><p className="text-[11px] text-muted-foreground">{user?.email ?? ""}</p></div></div>
          <ThemeToggle />
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
        <Logo className="text-base" /><div className="flex items-center gap-1">{exams.length > 1 && <ExamSwitcher exams={exams} currentExamId={currentExamId} compact disabled={demo} />}<ThemeToggle /><Link href="/faq" aria-label="Help" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><CircleHelp className="size-4" /></Link></div>
      </header>
      <main id="main-content" tabIndex={-1} className="pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none md:ml-[248px] md:pb-0">{demo && <div role="status" className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-center text-xs font-medium text-blue-950 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100">Simulated demo data. Changes are temporary and remain only in this browser.</div>}{children}</main>
      <nav aria-label="Primary" className={cn("fixed inset-x-0 bottom-0 z-50 grid min-h-[76px] border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden", navItems.length > 6 ? "grid-cols-7" : "grid-cols-6")}>
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={activePath(pathname, href) ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground", activePath(pathname, href) && "text-emerald-800 dark:text-emerald-400")}>
            <Icon className="size-5" />{label === "New session" ? "Practice" : label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
