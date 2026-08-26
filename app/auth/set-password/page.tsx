import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPassword } from "@/lib/actions";
import { getProfile } from "@/lib/data";

export const metadata: Metadata = { title: "Set your password", robots: { index: false, follow: false } };

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [profile, { error }] = await Promise.all([getProfile(), searchParams]);
  if (!profile) redirect("/login");
  return (
    <main id="main-content" tabIndex={-1} className="grid min-h-screen place-items-center bg-[#f7faf9] px-5 outline-none dark:bg-[#07110e]">
      <div className="w-full max-w-md">
        <Logo className="mb-8 text-lg" />
        <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5 dark:border-white/10">
          <CardHeader><CardTitle className="text-2xl tracking-tight">Welcome, {profile.name}</CardTitle><CardDescription>Choose a password for {profile.email} to finish setting up your account.</CardDescription></CardHeader>
          <CardContent>
            <form action={setPassword} className="space-y-5">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
              <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="h-11" /></div>
              <div className="space-y-2"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="h-11" /></div>
              <Button type="submit" className="h-11 w-full bg-emerald-800 text-base hover:bg-emerald-900">Save and continue</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
