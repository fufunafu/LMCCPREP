import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, MailCheck, UserPlus } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/google-button";
import { signUp } from "@/lib/actions";
import { billingConfigured } from "@/lib/billing-core";
import { safeReturnPath } from "@/lib/urls";

export const metadata: Metadata = { title: "Create an account", robots: { index: false, follow: false } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ email?: string; error?: string; notice?: string; next?: string }> }) {
  // Self-serve accounts exist to hold a subscription, so this page only opens once Checkout is live.
  if (!billingConfigured()) notFound();
  const { email, error, notice, next } = await searchParams;
  const returnPath = safeReturnPath(next, "/billing");
  return (
    <main id="main-content" tabIndex={-1} className="grid min-h-screen place-items-center bg-[#f7faf9] px-5 py-10 outline-none dark:bg-[#07110e]">
      <div className="w-full max-w-md">
        <Logo className="mb-8 text-lg" />
        <Link href="/pricing" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to pricing</Link>
        <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5 dark:border-white/10">
          {notice === "confirm" ? (
            <>
              <CardHeader>
                <div className="mb-2 grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><MailCheck className="size-5" /></div>
                <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
                <CardDescription>We sent a confirmation link{email ? <> to <span className="font-medium text-foreground">{email}</span></> : null}. Open it to activate your account and continue to checkout.</CardDescription>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">Nothing is charged until you complete Stripe Checkout. If the email does not arrive within a few minutes, check your spam folder or <Link href="/support" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">contact support</Link>.</p></CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <div className="mb-2 grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><UserPlus className="size-5" /></div>
                <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
                <CardDescription>Set up a Montreal QBank account, then choose a plan at Stripe Checkout.</CardDescription>
              </CardHeader>
              <CardContent>
                <GoogleButton next={returnPath} label="Sign up with Google" />
                <div className="relative my-5"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or use email</span></div></div>
                <form action={signUp} className="space-y-5">
                  <input type="hidden" name="next" value={returnPath} />
                  {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
                  <fieldset className="space-y-2"><legend className="text-sm font-medium">Which exam are you preparing for?</legend><div className="grid gap-2 sm:grid-cols-2">{[["mccqe", "MCCQE Part I"], ["usmle", "USMLE Step 1 / Step 2 CK"]].map(([value, label], index) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 dark:has-[:checked]:bg-emerald-950/40"><input type="radio" name="examId" value={value} defaultChecked={index === 0} className="accent-emerald-700" />{label}</label>)}</div><p className="text-xs text-muted-foreground">You can switch exams any time in Settings; one subscription covers both.</p></fieldset>
                  <div className="space-y-2"><Label htmlFor="signup-email">Email address</Label><Input id="signup-email" name="email" type="email" defaultValue={email ?? ""} placeholder="you@university.ca" autoComplete="email" required className="h-11" /></div>
                  <div className="space-y-2"><Label htmlFor="signup-password">Password</Label><Input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={10} required className="h-11" /><p className="text-xs text-muted-foreground">At least 10 characters.</p></div>
                  <div className="space-y-2"><Label htmlFor="signup-confirm">Confirm password</Label><Input id="signup-confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="h-11" /></div>
                  <Button type="submit" className="h-11 w-full bg-emerald-800 text-base hover:bg-emerald-900">Create account <ArrowRight /></Button>
                  <p className="text-center text-xs leading-5 text-muted-foreground">By continuing you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy notice</Link>.</p>
                </form>
                <p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link href={`/login?next=${encodeURIComponent(returnPath)}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Sign in</Link></p>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
