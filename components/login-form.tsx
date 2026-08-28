"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { signIn, startDemoSession } from "@/lib/actions";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-auth";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const params = useSearchParams();
  const error = params.get("error");
  const notice = params.get("notice");
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [demoPending, startDemo] = useTransition();
  const next = params.get("next") ?? "/dashboard";
  return (
    <form className="space-y-5" action={signIn}>
      <input type="hidden" name="next" value={next} />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {notice === "reset-sent" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">If an account matches that email, a password-reset link is on its way.</p>}
      {notice === "signed-out" && <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">You have been signed out.</p>}
      <div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.ca" autoComplete="email" required className="h-11" /></div>
      <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">Forgot password?</Link></div><div className="relative"><Input id="password" name="password" type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="h-11 pr-10" /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
      <Button type="submit" className="h-11 w-full bg-emerald-800 text-base hover:bg-emerald-900">Sign in <ArrowRight /></Button>
      <div className="relative py-1"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div></div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/25">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">Explore the demo</p><p className="mt-0.5 text-xs text-emerald-900 dark:text-emerald-200">No account or saved data required.</p></div><Button type="button" variant="outline" size="sm" disabled={demoPending} className="shrink-0 border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" onClick={() => startDemo(async () => { await startDemoSession(next); })}>{demoPending ? "Opening demo…" : "Use demo login"}</Button></div>
        <p className="mt-3 font-mono text-[11px] text-emerald-950 dark:text-emerald-100">{DEMO_EMAIL} · {DEMO_PASSWORD}</p>
      </div>
    </form>
  );
}
