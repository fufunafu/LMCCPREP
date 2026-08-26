import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main id="main-content" tabIndex={-1} className="grid min-h-screen bg-[#f7faf9] outline-none dark:bg-[#07110e] lg:grid-cols-[1fr_1.05fr]">
      <div className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16">
        <Logo className="text-lg" />
        <div className="my-auto w-full max-w-md self-center py-12">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to home</Link>
          <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5 dark:border-white/10"><CardHeader className="pb-6"><CardTitle className="text-2xl tracking-tight">Welcome back</CardTitle><CardDescription>Sign in to continue your MCCQE preparation.</CardDescription></CardHeader><CardContent><Suspense><LoginForm /></Suspense><p className="mt-6 text-center text-sm text-muted-foreground">Need an invitation? <Link href="/#access" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Request access</Link></p></CardContent></Card>
        </div>
        <p className="text-center text-xs text-muted-foreground">Private access for invited learners only.</p>
      </div>
      <div className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-[500px] rounded-full bg-emerald-500/20 blur-3xl" /><div className="absolute -bottom-36 -left-20 size-[420px] rounded-full bg-cyan-500/10 blur-3xl" />
        <p className="relative text-sm font-medium text-emerald-300">Built around your exam</p>
        <div className="relative max-w-lg"><h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em]">A clearer way to turn practice into progress.</h1><div className="mt-10 space-y-5">{["1,600+ focused clinical questions", "Tutor and timed practice modes", "Clear analytics down to the topic"].map((item) => <div key={item} className="flex items-center gap-3 text-slate-300"><CheckCircle2 className="size-5 text-emerald-400" />{item}</div>)}</div></div>
        <p className="relative text-sm text-slate-400">Current MCCQE preparation, without the noise.</p>
      </div>
    </main>
  );
}
