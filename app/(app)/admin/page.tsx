import Link from "next/link";
import { Stat, formatDate } from "@/components/admin/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminOverview } from "@/lib/admin-data";
import { formatCad } from "@/lib/billing-core";

export default async function AdminOverviewPage() {
  const o = await getAdminOverview();
  const statuses = Object.entries(o.subscriptions).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Subscribed" value={o.access.subscribed} hint={o.planCounts.map((entry) => `${entry.count} ${entry.plan.toLowerCase()}`).join(" · ") || "No paid plans yet"} />
        <Stat label="Free access (grants)" value={o.access.granted} hint="Complimentary, admin, or review accounts" />
        <Stat label="No access" value={o.access.none} hint={o.billing.required ? "Blocked until they subscribe" : "Enforcement is off, so they still get in"} />
        <Stat label="Est. MRR" value={formatCad(o.mrrCad)} hint="Active plans normalised to per month, before tax" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Accounts" value={o.users.total} hint={`${o.users.last7Days} new in 7 days · ${o.users.last30Days} in 30 days`} />
        <Stat label="Unconfirmed emails" value={o.users.unconfirmed} hint="Signed up but never confirmed" />
        <Stat label="Access requests" value={o.requests.total} hint={`${o.requests.last30Days} in the last 30 days`} />
        <Stat label="Questions" value={o.questions.total} hint={`${o.questions.approved} rights-approved and reviewed`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Subscription statuses</CardTitle><CardDescription>Latest Stripe status per account, including lapsed ones.</CardDescription></CardHeader><CardContent>{statuses.length ? <ul className="space-y-2 text-sm">{statuses.map(([status, count]) => <li key={status} className="flex items-center justify-between"><span className="capitalize">{status.replaceAll("_", " ")}</span><Badge variant="secondary">{count}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">No subscriptions yet.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Billing health</CardTitle><CardDescription>Enforcement and Stripe webhook delivery.</CardDescription></CardHeader><CardContent><dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Enforcement</dt><dd>{o.billing.required ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">On</Badge> : <Badge variant="secondary">Off</Badge>}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Grace period</dt><dd>{o.billing.graceDays} days</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Webhook events</dt><dd>{o.webhooks.total} total, {o.webhooks.failed} failed</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Last event</dt><dd>{formatDate(o.webhooks.lastReceivedAt)}</dd></div>
          {o.webhooks.lastError && <div><dt className="text-muted-foreground">Last error</dt><dd className="mt-1 break-words rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{o.webhooks.lastError}</dd></div>}
        </dl><p className="mt-4 text-xs text-muted-foreground">Change enforcement from <Link href="/admin/settings" className="underline">Settings</Link>.</p></CardContent></Card>
      </div>
    </div>
  );
}
