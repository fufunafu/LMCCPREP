import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/actions";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string; error?: string }> }) {
  const { email, error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7faf9] px-5 py-10 dark:bg-[#07110e]">
      <div className="w-full max-w-md">
        <Logo className="mb-8 text-lg" />
        <Link href="/login" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to sign in</Link>
        <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5 dark:border-white/10">
          <CardHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Mail className="size-5" /></div>
            <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
            <CardDescription>Enter the email address for your invited LMCC Prep account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={requestPasswordReset} className="space-y-5">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
              <div className="space-y-2"><Label htmlFor="reset-email">Email address</Label><Input id="reset-email" name="email" type="email" defaultValue={email ?? ""} autoComplete="email" required className="h-11" /></div>
              <Button type="submit" className="h-11 w-full bg-emerald-800 text-base hover:bg-emerald-900">Send reset link</Button>
            </form>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">For privacy, the confirmation is the same whether or not an invited account exists.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
