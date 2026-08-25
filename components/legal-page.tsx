import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><header className="border-b"><div className="mx-auto flex h-20 max-w-4xl items-center justify-between px-5 sm:px-8"><Logo /><ThemeToggle /></div></header><main className="mx-auto max-w-4xl px-5 py-14 sm:px-8"><p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Montreal QBank</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1><p className="mt-5 max-w-2xl leading-7 text-muted-foreground">{intro}</p><div className="mt-10 space-y-8 text-sm leading-7 text-foreground [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:text-muted-foreground">{children}</div></main><footer className="border-t"><div className="mx-auto flex max-w-4xl flex-wrap gap-x-5 gap-y-2 px-5 py-8 text-sm text-muted-foreground sm:px-8"><Link href="/">Home</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refund-policy">Refund policy</Link><Link href="/support">Support</Link></div></footer></div>;
}
