"use client";

import Link from "next/link";
import { FormEvent } from "react";
import { toast } from "sonner";
import { requestAccess, startDemoSession } from "@/lib/actions";
import { ArrowRight, BarChart3, Bookmark, CheckCircle2, Clock3, GraduationCap, LineChart, Menu, ShieldCheck, Sparkles, TimerReset, WalletCards, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { BillingPlan, Subject } from "@/lib/types";
import { useState } from "react";
import { marketingFaqs } from "@/lib/marketing-content";

const features = [
  { icon: Sparkles, title: "Tutor mode", copy: "Get immediate feedback and a clear explanation while the reasoning is still fresh." },
  { icon: TimerReset, title: "Timed mode", copy: "Build your pacing with focused sessions that feel closer to exam day." },
  { icon: LineChart, title: "Useful analytics", copy: "See accuracy, pace, weak topics, and study consistency without digging through reports." },
  { icon: Bookmark, title: "Flags and notes", copy: "Mark the questions worth revisiting and keep your own clinical pearls beside them." },
];

export function MarketingPage({ subjects, plans }: { subjects: Subject[]; plans: BillingPlan[] }) {
  const approvedQuestionCount = subjects.reduce((sum, subject) => sum + subject.questionCount, 0);
  const questionTotal = approvedQuestionCount.toLocaleString("en-CA");
  const trialDays = plans.find((plan) => plan.trialDays)?.trialDays;
  const monthly = plans.find((plan) => plan.key === "monthly")?.amountCad;
  const annual = plans.find((plan) => plan.key === "annual")?.amountCad;
  const annualSavings = monthly && annual ? monthly * 12 - annual : null;
  const annualSavingsPercent = annualSavings && monthly ? Math.round((annualSavings / (monthly * 12)) * 100) : null;
  const [menu, setMenu] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    try {
      const result = await requestAccess(new FormData(form));
      if (!result.demo) form.reset();
      toast.success(result.demo ? "Demo request not sent" : "Access request received", {
        description: result.demo ? "Sign out of the demo to submit an access request." : "Thanks. We will be in touch when an invitation is available.",
      });
    } catch {
      toast.error("Could not send your request", { description: "Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f8fbfa] dark:bg-[#07110e]">
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-[#f8fbfa]/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#07110e]/85">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8"><Logo className="text-lg" />
          <nav aria-label="Marketing navigation" className="hidden items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex"><Link href="#features">Features</Link><Link href="#subjects">Subjects</Link><Link href="#pricing">Pricing</Link><Link href="#faq">FAQ</Link></nav>
          <div className="hidden items-center gap-2 md:flex"><ThemeToggle /><Link href="/login" className={buttonVariants({ variant: "ghost", size: "lg" })}>Sign in</Link><Link href="#access" className={buttonVariants({ size: "lg", className: "bg-emerald-800 hover:bg-emerald-900" })}>Request access</Link></div>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Toggle menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</Button>
        </div>
        {menu && <div className="border-t px-5 py-4 md:hidden"><div className="flex flex-col gap-1">{[["Features", "#features"], ["Subjects", "#subjects"], ["Pricing", "#pricing"], ["FAQ", "#faq"], ["Sign in", "/login"]].map(([label, href]) => <Link key={label} href={href} onClick={() => setMenu(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">{label}</Link>)}</div></div>}
      </header>
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:pb-32 lg:pt-24">
          <div><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"><GraduationCap className="size-4" />Built for the current MCCQE</div>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.045em] text-slate-950 dark:text-white sm:text-6xl lg:text-7xl">Practice with purpose. <span className="text-emerald-600 dark:text-emerald-400">Walk in prepared.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">A focused private-beta question bank for Canadian medical students and graduates across five currently available disciplines. {questionTotal} questions are currently approved for paid distribution.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><form action={startDemoSession.bind(null, "/dashboard")}><Button type="submit" size="lg" className="h-12 w-full bg-emerald-800 px-5 text-base hover:bg-emerald-900">Try the free demo <ArrowRight /></Button></form><Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 px-5 text-base" })}>Sign in</Link></div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">{["No card required", "Temporary demo data", "Made for mobile"].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-emerald-600" />{item}</span>)}</div>
          </div>
          <div className="relative mx-auto w-full max-w-xl"><div className="absolute -inset-12 -z-10 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-700/20" /><div className="rounded-[28px] border border-slate-200/80 bg-white p-3 shadow-2xl shadow-emerald-950/10 dark:border-white/10 dark:bg-slate-950"><div className="rounded-[20px] bg-slate-950 p-6 text-white sm:p-8"><div className="flex items-center justify-between text-xs text-slate-400 sm:text-sm"><span>Question 12 of 20</span><span>Pediatrics · Cardiology</span></div><p className="mt-8 text-lg leading-7">A 6-year-old presents with a new murmur. Which finding most strongly suggests an innocent murmur?</p><div className="mt-6 space-y-3">{["Louder with standing", "Soft, systolic, and position-dependent", "Associated cyanosis", "A fixed split S2"].map((option, index) => <div key={option} className={`flex items-center gap-3 rounded-xl border p-3.5 text-sm ${index === 1 ? "border-emerald-400 bg-emerald-400/10" : "border-white/10 bg-white/5"}`}><span className="grid size-6 place-items-center rounded-md bg-white/10 text-xs">{index + 1}</span>{option}</div>)}</div><div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-3/5 rounded-full bg-emerald-400" /></div></div></div>
            <div className="absolute -bottom-7 -left-4 hidden rounded-2xl border bg-white p-4 shadow-xl dark:bg-slate-900 sm:block"><BarChart3 className="mb-2 size-5 text-emerald-600" /><p className="text-xs text-muted-foreground">Current accuracy</p><p className="text-xl font-semibold">78%</p></div><div className="absolute -right-4 -top-6 hidden rounded-2xl border bg-white p-4 shadow-xl dark:bg-slate-900 sm:block"><Clock3 className="mb-2 size-5 text-emerald-600" /><p className="text-xs text-muted-foreground">Avg. response</p><p className="text-xl font-semibold">72 sec</p></div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-y border-slate-200/70 bg-white py-24 dark:border-white/10 dark:bg-slate-950/50"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-2xl"><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Everything has a purpose</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">A practice space built for better decisions.</h2><p className="mt-4 leading-7 text-muted-foreground">Each session helps you test recall, learn from mistakes, and decide what deserves your attention next.</p></div><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map(({ icon: Icon, title, copy }) => <div key={title} className="rounded-2xl border bg-background p-6"><div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="size-5" /></div><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p></div>)}</div></div></section>

        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2"><div className="rounded-[28px] border bg-white p-5 shadow-xl shadow-slate-900/5 dark:bg-slate-950"><div className="rounded-2xl bg-muted/60 p-5"><div className="grid grid-cols-3 gap-3">{[["76%", "Accuracy"], ["487", "Attempted"], ["9 days", "Streak"]].map(([value, label]) => <div key={label} className="rounded-xl border bg-background p-4"><p className="text-xl font-semibold sm:text-2xl">{value}</p><p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{label}</p></div>)}</div><div className="mt-4 rounded-xl border bg-background p-5"><p className="text-sm font-medium">Last 12 weeks</p><div className="mt-4 grid grid-flow-col grid-rows-7 gap-1">{Array.from({ length: 84 }, (_, index) => <span key={index} className={`aspect-square rounded-[3px] ${index % 11 === 0 ? "bg-muted" : index % 4 === 0 ? "bg-emerald-300 dark:bg-emerald-700" : index % 3 === 0 ? "bg-emerald-500" : "bg-emerald-100 dark:bg-emerald-950"}`} />)}</div></div></div></div><div><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Know where you stand</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Progress you can actually act on.</h2><p className="mt-5 max-w-lg leading-7 text-muted-foreground">Your dashboard brings accuracy, pace, activity, and weak topics together. No vanity numbers, just a useful next step.</p><ul className="mt-7 space-y-4 text-sm">{["Compare accuracy across all five available disciplines", "Spot weak topics before they become blind spots", "Build consistency with a visible study streak"].map((item) => <li key={item} className="flex items-center gap-3"><CheckCircle2 className="size-5 text-emerald-600" />{item}</li>)}</ul></div></section>

        <section id="subjects" aria-labelledby="subjects-title" className="scroll-mt-20 bg-slate-950 py-24 text-white"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="text-sm font-semibold text-emerald-400">Current five-discipline scope</p><h2 id="subjects-title" className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{questionTotal} approved questions across five available disciplines.</h2></div><p className="max-w-md text-sm leading-6 text-slate-300">Counts include only questions approved for distribution and editorially reviewed. Obstetrics and Gynecology is not yet included in the reviewed bank.</p></div><div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{subjects.map((subject, index) => <div key={subject.id} className="rounded-2xl border border-white/10 bg-white/5 p-5"><span className="text-xs text-emerald-400">0{index + 1}</span><h3 className="mt-6 font-medium">{subject.name}</h3><p className="mt-1 text-2xl font-semibold">{subject.questionCount}</p><p className="text-xs text-slate-400">approved questions</p></div>)}</div></div></section>

        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-b bg-white py-24 dark:bg-slate-950/50">
          <div className="mx-auto max-w-5xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center"><WalletCards className="mx-auto size-8 text-emerald-700" /><p className="mt-5 text-sm font-semibold text-emerald-800 dark:text-emerald-400">Simple subscription access</p><h2 id="pricing-title" className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">One question bank, two billing options.</h2><p className="mt-4 leading-7 text-muted-foreground">Invited learners can choose monthly or annual access, manage payment methods and invoices through Stripe, and cancel from the customer portal.</p><form action={startDemoSession.bind(null, "/dashboard")} className="mt-5"><Button type="submit" variant="outline">Try the free demo, no card required</Button></form></div>
            <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">{plans.map((plan) => <div key={plan.key} className="rounded-2xl border bg-background p-6"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">{plan.name}</h3>{plan.key === "annual" && annualSavings ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Save ${annualSavings} ({annualSavingsPercent}%)</Badge> : null}</div><p className="mt-4 text-3xl font-semibold">{plan.formattedPrice ?? "CAD pricing"}</p><p className="mt-1 text-sm text-muted-foreground">{plan.formattedPrice ? plan.cadence : "Provided with your invitation"}</p><ul className="mt-6 space-y-3 text-sm">{["Available reviewed questions and explanations", "Tutor and timed sessions", "Progress, flags, and notes", ...(plan.trialDays ? [`${plan.trialDays}-day trial before paid billing`] : []), "Self-service billing portal"].map((feature) => <li key={feature} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />{feature}</li>)}</ul><Link href="#access" className={buttonVariants({ variant: "outline", className: "mt-6 w-full" })}>Request invite</Link></div>)}</div>
            <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-muted-foreground">{trialDays ? `A ${trialDays}-day paid-product trial is configured. ` : "No paid-product free trial is configured; the separate demo is free and requires no card. "}Subscriptions renew automatically. Cancel in the Stripe portal to stop renewal; access continues through the paid period. Applicable taxes and the final total are shown before payment. Refund terms are linked below. Billing is processed by Stripe.</p>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-24 sm:px-8"><div className="text-center"><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Questions, answered</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Before you request access</h2></div><div className="mt-10 divide-y rounded-2xl border bg-background px-5 sm:px-7">{marketingFaqs.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{question}<span className="text-xl text-muted-foreground group-open:rotate-45">+</span></summary><p className="max-w-2xl pt-3 text-sm leading-6 text-muted-foreground">{answer}</p></details>)}</div></section>

        <section id="access" className="scroll-mt-20 px-5 pb-20 sm:px-8"><div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-emerald-800 px-6 py-14 text-white sm:px-12 lg:px-16"><div className="absolute -right-20 -top-24 size-72 rounded-full border-[48px] border-white/10" /><div className="relative grid items-center gap-10 lg:grid-cols-[1fr_.85fr]"><div><ShieldCheck className="size-8 text-emerald-100" /><h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Ready for more focused practice?</h2><p className="mt-4 max-w-xl leading-7 text-emerald-50">Try the no-card demo now, or request an invitation for saved account access.</p></div><form onSubmit={submit} className="rounded-2xl bg-white p-3 shadow-xl sm:flex"><label className="sr-only" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label><Input type="email" name="email" required aria-label="Email address" placeholder="Your university email" className="h-12 border-0 text-slate-950 shadow-none focus-visible:ring-0" /><Button type="submit" disabled={submitting} className="mt-2 h-12 w-full bg-slate-950 px-5 hover:bg-slate-800 sm:mt-0 sm:w-auto">{submitting ? "Sending…" : "Request access"} <ArrowRight /></Button></form></div></div></section>
      </main>
      <footer className="border-t px-5 py-8 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row"><Logo className="text-foreground" /><p>Independent study preparation for the MCCQE. Not affiliated with the Medical Council of Canada.</p><div className="flex flex-wrap items-center justify-center gap-4"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refund-policy">Refunds</Link><Link href="/support">Support</Link><Link href="/login">Sign in</Link><ThemeToggle /></div></div></footer>
    </div>
  );
}
