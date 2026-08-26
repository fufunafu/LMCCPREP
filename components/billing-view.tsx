"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, CircleAlert, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { BillingPortalButton } from "@/components/billing-portal-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import type { BillingPlan, BillingPlanKey, BillingSummary } from "@/lib/types";
import { cn, dateLabel } from "@/lib/utils";

function statusLabel(status?: string) {
  if (!status) return "No subscription";
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function BillingView({ plans, summary, checkout, notice }: { plans: BillingPlan[]; summary: BillingSummary; checkout?: string; notice?: string }) {
  const router = useRouter();
  const [pendingPlan, setPendingPlan] = useState<BillingPlanKey>();
  const [pollingComplete, setPollingComplete] = useState(false);
  const paymentNeedsAttention = Boolean(summary.paymentFailedAt) || summary.status === "past_due" || summary.status === "unpaid";
  const subscriptionNeedsAttention = paymentNeedsAttention
    || summary.status === "incomplete"
    || summary.status === "incomplete_expired"
    || summary.status === "paused"
    || (summary.status === "canceled" && !summary.subscriptionHasAccess);

  useEffect(() => {
    if (checkout !== "success" || summary.subscriptionHasAccess) return;
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 5) {
        window.clearInterval(interval);
        setPollingComplete(true);
      }
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [checkout, router, summary.subscriptionHasAccess]);

  const startCheckout = async (plan: BillingPlanKey) => {
    setPendingPlan(plan);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Could not start Checkout.");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start Checkout.");
      setPendingPlan(undefined);
    }
  };

  const endDate = dateLabel(summary.accessUntil ?? summary.currentPeriodEnd);
  const canChoosePlan = !summary.granted
    && !summary.subscriptionHasAccess
    && (
      !summary.subscriptionId
      || summary.status === "incomplete_expired"
      || summary.status === "unpaid"
      || summary.status === "canceled"
    );
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageHeader eyebrow="Account" title="Billing" description="Choose a plan or manage your Montreal QBank subscription." />

      {notice === "subscription-required" && <div role="alert" className="mb-5 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p>An active subscription is required to enter the question bank. Choose a plan below or update your payment method.</p></div>}
      {checkout === "canceled" && <div role="status" className="mb-5 rounded-xl border bg-muted/50 p-4 text-sm">Checkout was canceled. Nothing was charged.</div>}
      {checkout === "success" && !summary.subscriptionHasAccess && <div role="status" className="mb-5 flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 sm:flex-row sm:items-center"><div className="flex flex-1 gap-3">{pollingComplete ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <RefreshCw className="mt-0.5 size-4 shrink-0 animate-spin" />}<p>{pollingComplete ? "Checkout finished, but subscription confirmation is taking longer than expected. You can refresh safely while the verified webhook finishes." : "Checkout finished. Waiting for the verified Stripe webhook to confirm subscription access."}</p></div>{pollingComplete && <Button size="sm" variant="outline" onClick={() => router.refresh()}><RefreshCw />Refresh status</Button>}</div>}
      {summary.error && <div role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{summary.error}</div>}

      {summary.mode === "demo" && <Card className="mb-6"><CardHeader><CardTitle>Demo access</CardTitle><CardDescription>The demo never contacts Stripe or Supabase billing services.</CardDescription></CardHeader><CardContent><Link href="/dashboard" className={buttonVariants()}>Return to demo</Link></CardContent></Card>}

      {summary.subscriptionId && <Card className={cn("mb-6", subscriptionNeedsAttention ? "border-amber-300 dark:border-amber-800" : "border-emerald-200 dark:border-emerald-900")}><CardHeader><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><CardTitle className="flex items-center gap-2">{subscriptionNeedsAttention ? <CircleAlert className="size-5 text-amber-600" /> : <ShieldCheck className="size-5 text-emerald-600" />}Current subscription</CardTitle><CardDescription className="mt-2">{summary.plan ? `${summary.plan === "annual" ? "Annual" : "Monthly"} plan` : "Montreal QBank plan"}</CardDescription></div><span className={cn("w-fit rounded-full px-3 py-1 text-xs font-semibold", subscriptionNeedsAttention ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300")}>{summary.paymentFailedAt ? "Payment failed" : statusLabel(summary.status)}</span></div></CardHeader><CardContent><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="text-sm text-muted-foreground">{paymentNeedsAttention ? <p>{summary.status === "unpaid" ? "This subscription is unpaid. Update the payment method or review recovery options in the billing portal." : "Your payment needs attention. Update the payment method before the grace period ends."}</p> : summary.status === "incomplete" ? <p>Checkout has not completed. Manage billing or wait for Stripe to expire the unfinished subscription.</p> : summary.status === "incomplete_expired" ? <p>The unfinished Checkout expired. Choose a new plan below when you are ready.</p> : summary.status === "paused" ? <p>Your subscription is paused. Open the billing portal to review recovery options.</p> : summary.status === "canceled" && !summary.subscriptionHasAccess ? <p>This subscription has ended. Choose a new plan below to restore access.</p> : summary.cancelAtPeriodEnd ? <p>Access ends {endDate ?? "at the end of the paid period"}.</p> : <p>{endDate ? `Current access is confirmed through ${endDate}.` : "Your subscription is active."}</p>}</div><BillingPortalButton disabled={!summary.customerId || summary.mode === "demo"} label={paymentNeedsAttention ? "Update payment method" : "Manage billing"} /></div></CardContent></Card>}

      {!summary.required && <div role="status" className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">Billing enforcement is currently off. Existing invite access remains available while subscription setup is completed.</div>}

      {summary.mode !== "demo" && canChoosePlan && <div className="grid gap-5 md:grid-cols-2">{plans.map((plan) => {
        const features = [
          "Available rights-approved, reviewed questions",
          "Tutor and timed modes",
          "Progress analytics, flags, and notes",
          ...(plan.trialDays ? [`${plan.trialDays}-day trial before paid billing`] : []),
          "Cancel in the Stripe portal; access continues through the paid period",
        ];
        return <Card key={plan.key} className={cn(plan.key === "annual" && "border-emerald-300 shadow-sm dark:border-emerald-800")}><CardHeader><CardTitle>{plan.name}</CardTitle><CardDescription>Access to approved questions in Internal Medicine, Pediatrics, PMCH, Psychiatry, and Surgery. Obstetrics and Gynecology is not yet included.</CardDescription></CardHeader><CardContent><div className="mb-6"><p className="text-3xl font-semibold tracking-tight">{plan.formattedPrice ?? "CAD pricing"}</p><p className="mt-1 text-sm text-muted-foreground">{plan.formattedPrice ? plan.cadence : "Shown in your invitation and at Checkout"}</p></div><ul className="mb-6 space-y-3 text-sm">{features.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{feature}</li>)}</ul><Button className="w-full bg-emerald-800 hover:bg-emerald-900" disabled={!summary.configured || !plan.configured || Boolean(pendingPlan)} onClick={() => startCheckout(plan.key)}><CreditCard />{pendingPlan === plan.key ? "Opening Checkout…" : `Choose ${plan.name.toLowerCase()}`}</Button>{(!summary.configured || !plan.configured) && <p className="mt-3 text-center text-xs text-muted-foreground">This plan becomes available after Stripe test configuration is added.</p>}</CardContent></Card>;
      })}</div>}
      {summary.mode !== "demo" && canChoosePlan && <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Prices are in CAD. Applicable taxes, if any, and the final total are shown at Stripe Checkout. Subscriptions renew automatically. Before continuing, review the <Link className="underline underline-offset-2" href="/terms">Terms</Link>, <Link className="underline underline-offset-2" href="/privacy">Privacy notice</Link>, and <Link className="underline underline-offset-2" href="/refund-policy">Refund and cancellation policy</Link>. <Link className="underline underline-offset-2" href="/support">Support</Link> is available for billing questions.</p>}

      {summary.granted && summary.mode !== "demo" && <Card className={cn(canChoosePlan && "mt-6")}><CardHeader><CardTitle>Complimentary access</CardTitle><CardDescription>Your account currently has access without a Stripe subscription.</CardDescription></CardHeader><CardContent><Link href="/dashboard" className={buttonVariants()}>Continue to dashboard</Link></CardContent></Card>}
      {summary.hasAccess && !summary.subscriptionId && !summary.granted && summary.mode !== "demo" && <Card className={cn(canChoosePlan && "mt-6")}><CardHeader><CardTitle>Private beta access</CardTitle><CardDescription>Subscription enforcement is off, so your invitation still provides access while billing is tested.</CardDescription></CardHeader><CardContent><Link href="/dashboard" className={buttonVariants()}>Continue to dashboard</Link></CardContent></Card>}
      {checkout === "success" && summary.subscriptionHasAccess && <div className="mt-6 flex flex-wrap gap-3"><Link href="/dashboard" className={buttonVariants({ className: "bg-emerald-800 hover:bg-emerald-900" })}>Continue to dashboard</Link><Button variant="outline" onClick={() => router.refresh()}><RefreshCw />Refresh status</Button></div>}
    </div>
  );
}
