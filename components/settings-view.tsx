"use client";

import { FormEvent, useState, useSyncExternalStore, useTransition } from "react";
import { resetProgress, signOut, updateProfile } from "@/lib/actions";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { AlertTriangle, CreditCard, Keyboard, Laptop, LogOut, Moon, Palette, Shield, Sun, User } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { BillingSummary, Profile } from "@/lib/types";
import { clearDemoPractice } from "@/lib/demo-practice";
import { BillingPortalButton } from "@/components/billing-portal-button";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

function billingDateLabel(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(date);
}

export function SettingsView({ profile, billing }: { profile?: Profile; billing: BillingSummary }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [showShortcuts, setShowShortcuts] = useState(profile?.showShortcuts ?? true);
  const [explanationAutoScroll, setExplanationAutoScroll] = useState(profile?.explanationAutoScroll ?? false);
  const [resetText, setResetText] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const [resetting, startResetting] = useTransition();
  const billingDate = billingDateLabel(billing.accessUntil ?? billing.currentPeriodEnd ?? billing.grantExpiresAt);
  const billingDescription = billing.mode === "demo"
    ? "The demo does not contact Stripe."
    : billing.paymentFailedAt || billing.status === "past_due"
      ? `Payment failed. Update your payment method before the grace period ends.${billingDate ? ` Access is available through ${billingDate}.` : ""}`
      : billing.subscriptionId
        ? `Status: ${billing.status?.replaceAll("_", " ") ?? "unknown"}.${billingDate ? ` ${billing.cancelAtPeriodEnd || billing.status === "canceled" ? "Access ends" : billing.status === "trialing" ? "Trial access is confirmed through" : "Next renewal"} ${billingDate}.` : ""}${billing.cancelAtPeriodEnd ? " Cancellation is scheduled." : ""}`
        : billing.granted
          ? billingDate ? `Complimentary access is available through ${billingDate}.` : "Complimentary access does not currently expire."
          : billing.required
            ? "Choose a plan to use the question bank."
            : "Billing enforcement is currently off for the private beta.";
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startSaving(async () => {
      try {
        const result = await updateProfile({ displayName: String(form.get("name") ?? ""), medicalSchool: String(form.get("school") ?? ""), targetExamDate: String(form.get("exam-date") ?? "") || null });
        toast.success("Profile saved", { description: result.demo ? "Demo changes are temporary." : "Your study profile has been updated." });
      } catch { toast.error("Could not save your profile. Try again."); }
    });
  };
  const savePreferences = () => startSaving(async () => {
    try {
      const result = await updateProfile({ showShortcuts, explanationAutoScroll });
      toast.success("Preferences saved", { description: result.demo ? "Demo changes are temporary." : "Your study preferences have been updated." });
    } catch { toast.error("Could not save your preferences. Try again."); }
  });
  const confirmReset = () => startResetting(async () => {
    try {
      const result = await resetProgress();
      if (result.demo) clearDemoPractice();
      setResetText(""); setResetOpen(false);
      toast.success(result.demo ? "Demo progress is temporary" : "Progress reset", { description: result.demo ? "Sign out to start the demo again." : "Attempts, flags, notes, and sessions were removed." });
    } catch { toast.error("Could not reset your progress. Nothing was intentionally changed."); }
  });
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageHeader eyebrow="Preferences" title="Settings" description="Manage how Montreal QBank looks and how your study profile appears." />
      <div className="space-y-5">
        <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><User className="size-5" /></div><div><CardTitle className="text-lg">Profile</CardTitle><CardDescription>Your basic learner details</CardDescription></div></div></CardHeader><CardContent><form onSubmit={save}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" name="name" defaultValue={profile?.name ?? ""} maxLength={80} required /></div><div className="space-y-2"><Label htmlFor="email-setting">Email</Label><Input id="email-setting" type="email" defaultValue={profile?.email ?? ""} readOnly /></div><div className="space-y-2"><Label htmlFor="school">Medical school</Label><Input id="school" name="school" defaultValue={profile?.medicalSchool ?? ""} maxLength={120} placeholder="Optional" /></div><div className="space-y-2"><Label htmlFor="exam-date">Target exam date</Label><Input id="exam-date" name="exam-date" defaultValue={profile?.targetExamDate ?? ""} type="date" /></div></div><Button type="submit" disabled={saving} className="mt-5 bg-emerald-800 hover:bg-emerald-900">{saving ? "Saving…" : "Save profile"}</Button></form></CardContent></Card>

        <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><Palette className="size-5" /></div><div><CardTitle className="text-lg">Appearance</CardTitle><CardDescription>Choose the theme that is easiest on your eyes</CardDescription></div></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3">{[{ value: "light", icon: Sun, label: "Light" }, { value: "dark", icon: Moon, label: "Dark" }, { value: "system", icon: Laptop, label: "System" }].map(({ value, icon: Icon, label }) => <button type="button" key={value} aria-pressed={mounted && theme === value} onClick={() => setTheme(value)} className={cn("flex items-center gap-3 rounded-xl border p-4 text-sm font-medium", mounted && theme === value && "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/10 dark:bg-emerald-950/30")}><Icon className="size-5" />{label}<span aria-hidden="true" className={cn("ml-auto size-4 rounded-full border-2", mounted && theme === value && "border-[5px] border-emerald-700")} /></button>)}</div></CardContent></Card>

        <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"><Keyboard className="size-5" /></div><div><CardTitle className="text-lg">Study preferences</CardTitle><CardDescription>Question-player behavior</CardDescription></div></div></CardHeader><CardContent className="space-y-0"><div className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">Show keyboard shortcuts</p><p className="mt-1 text-xs text-muted-foreground">Display hints in the question player.</p></div><Switch checked={showShortcuts} onCheckedChange={setShowShortcuts} aria-label="Show keyboard shortcuts" /></div><Separator /><div className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">Explanation auto-scroll</p><p className="mt-1 text-xs text-muted-foreground">Move the explanation into view after submitting.</p></div><Switch checked={explanationAutoScroll} onCheckedChange={setExplanationAutoScroll} aria-label="Explanation auto-scroll" /></div><Button variant="outline" disabled={saving} onClick={savePreferences} className="mt-4">{saving ? "Saving…" : "Save preferences"}</Button></CardContent></Card>

        <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><CreditCard className="size-5" /></div><div><CardTitle className="text-lg">Billing</CardTitle><CardDescription>Subscription and invoices</CardDescription></div></div></CardHeader><CardContent><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">{billing.mode === "demo" ? "Demo access" : billing.subscriptionId ? billing.plan ? `${billing.plan === "annual" ? "Annual" : "Monthly"} subscription` : "Montreal QBank subscription" : billing.hasAccess ? "Access included" : "Subscription required"}</p><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{billingDescription}</p></div><div className="flex flex-wrap gap-2">{billing.customerId && billing.mode !== "demo" ? <BillingPortalButton label={billing.paymentFailedAt || billing.status === "past_due" || billing.status === "unpaid" ? "Update payment method" : "Manage billing"} /> : <Link href="/billing" className={buttonVariants({ variant: "outline" })}>View billing</Link>}</div></div></CardContent></Card>

        <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"><Shield className="size-5" /></div><div><CardTitle className="text-lg">Account</CardTitle><CardDescription>Session and progress controls</CardDescription></div></div></CardHeader><CardContent><div className="flex flex-col justify-between gap-4 py-2 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">Sign out</p><p className="mt-1 text-xs text-muted-foreground">Return to the private access screen.</p></div><Button variant="outline" onClick={() => { clearDemoPractice(); signOut(); }}><LogOut />Sign out</Button></div><Separator className="my-4" /><div className="flex flex-col justify-between gap-4 py-2 sm:flex-row sm:items-center"><div><p className="flex items-center gap-2 text-sm font-medium text-destructive"><AlertTriangle className="size-4" />Reset all progress</p><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">Permanently remove attempts, flags, notes, and practice sessions while keeping your account.</p></div><Dialog open={resetOpen} onOpenChange={(open) => { setResetOpen(open); if (!open) setResetText(""); }}><DialogTrigger render={<Button variant="destructive" />}>Reset progress</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Reset all study progress?</DialogTitle><DialogDescription>This cannot be undone. Your account and profile will remain, but all attempts, flags, notes, and sessions will be removed.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="reset-confirmation">Type RESET to confirm</Label><Input id="reset-confirmation" value={resetText} onChange={(event) => setResetText(event.target.value)} autoComplete="off" /></div><DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button variant="destructive" disabled={resetText !== "RESET" || resetting} onClick={confirmReset}>{resetting ? "Resetting…" : "Reset everything"}</Button></DialogFooter></DialogContent></Dialog></div></CardContent></Card>
      </div>
    </div>
  );
}
