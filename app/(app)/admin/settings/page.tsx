import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { billingCheckoutMode, billingPlans, stripePaymentLinks, stripePortalLoginUrl } from "@/lib/billing-core";
import { getAdminOverview } from "@/lib/admin-data";

export default async function AdminSettingsPage() {
  const overview = await getAdminOverview();
  const mode = billingCheckoutMode();
  const links = stripePaymentLinks();
  const plans = billingPlans();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Enforcement</CardTitle><CardDescription>Whether a subscription or grant is required to use the question bank.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between"><span>Database switch (authoritative)</span>{overview.billing.required ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">On</Badge> : <Badge variant="secondary">Off</Badge>}</div>
        <div className="flex items-center justify-between"><span>Application override (BILLING_REQUIRED)</span><Badge variant="secondary">{process.env.BILLING_REQUIRED?.trim().toLowerCase() === "true" ? "true" : "false"}</Badge></div>
        <div className="flex items-center justify-between"><span>Failed-payment grace period</span><span>{overview.billing.graceDays} days</span></div>
        <p className="text-xs text-muted-foreground">Toggle from the terminal so the change is deliberate and logged: <code>npm run billing:enforce -- on|off</code>, then set <code>BILLING_REQUIRED</code> in Vercel and redeploy.</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Stripe configuration</CardTitle><CardDescription>Live values read from the environment of this deployment.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between"><span>Checkout mode</span><Badge variant="secondary">{mode ?? "not configured"}</Badge></div>
        {plans.map((plan) => <div key={plan.key} className="flex items-center justify-between gap-4"><span>{plan.name}{plan.formattedPrice ? ` · ${plan.formattedPrice} ${plan.cadence}` : ""}</span><span className="truncate text-xs text-muted-foreground">{plan.priceId ?? "no price"}{links[plan.key] ? " · link ✓" : ""}</span></div>)}
        <div className="flex items-center justify-between"><span>Portal login link</span><span className="text-xs text-muted-foreground">{stripePortalLoginUrl() ? "configured" : "missing"}</span></div>
      </CardContent></Card>
    </div>
  );
}
