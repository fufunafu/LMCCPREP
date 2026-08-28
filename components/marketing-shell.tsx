"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";

export function MarketingShell({ showSubjects, showPricing, checkoutAvailable = false, children }: { showSubjects: boolean; showPricing: boolean; checkoutAvailable?: boolean; children: React.ReactNode }) {
  // Once Checkout is live the primary call to action is subscribing, not requesting an invite.
  const cta: [string, string] = checkoutAvailable ? ["Subscribe", "/pricing"] : ["Request access", "/request-access"];
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const links: Array<[string, string]> = [
    ["Features", "/features"],
    ...(showSubjects ? [["Subjects", "/subjects"] as [string, string]] : []),
    ...(showPricing ? [["Pricing", "/pricing"] as [string, string]] : []),
    ["FAQ", "/faq"],
    ["Coaching", "/coaching"],
  ];
  const current = (href: string) => (pathname === href ? "page" : undefined);
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f8fbfa] dark:bg-[#07110e]">
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-[#f8fbfa]/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#07110e]/85">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8"><Logo className="text-lg" />
          <nav aria-label="Marketing navigation" className="hidden items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">{links.map(([label, href]) => <Link key={href} href={href} aria-current={current(href)} className="aria-[current=page]:text-emerald-800 dark:aria-[current=page]:text-emerald-400">{label}</Link>)}</nav>
          <div className="hidden items-center gap-2 md:flex"><ThemeToggle /><Link href="/login" className={buttonVariants({ variant: "ghost", size: "lg" })}>Sign in</Link><Link href={cta[1]} className={buttonVariants({ size: "lg", className: "bg-emerald-800 hover:bg-emerald-900" })}>{cta[0]}</Link></div>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Toggle menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</Button>
        </div>
        {menu && <div className="border-t px-5 py-4 md:hidden"><div className="flex flex-col gap-1">{[...links, cta, ["Sign in", "/login"]].map(([label, href]) => <Link key={href} href={href} aria-current={current(href)} onClick={() => setMenu(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted aria-[current=page]:text-emerald-800 dark:aria-[current=page]:text-emerald-400">{label}</Link>)}</div></div>}
      </header>
      <main id="main-content" tabIndex={-1} className="outline-none">{children}</main>
      <footer className="border-t px-5 py-8 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row"><Logo className="text-foreground" /><p>Independent study preparation for the MCCQE and USMLE. Not affiliated with the Medical Council of Canada, the NBME, or the FSMB.</p><div className="flex flex-wrap items-center justify-center gap-4"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link>{showPricing ? <Link href="/refund-policy">Refunds</Link> : null}<Link href="/support">Support</Link><Link href="/login">Sign in</Link><ThemeToggle /></div></div><div className="mx-auto mt-4 flex max-w-7xl justify-end"><Link href="/admin" aria-label="Admin panel" className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground">admin</Link></div></footer>
    </div>
  );
}
