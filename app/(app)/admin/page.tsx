import {
  CircleDollarSign,
  CreditCard,
  FileQuestion,
  MailWarning,
  Settings2,
  ShieldAlert,
  TicketCheck,
  UserCheck,
  UsersRound,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { Stat, formatDate } from "@/components/admin/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminOverview } from "@/lib/admin-data";
import { formatCad } from "@/lib/billing-core";

export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();
  const statuses = Object.entries(overview.subscriptions).sort((a, b) => b[1] - a[1]);
  const accessTotal = overview.access.subscribed + overview.access.granted + overview.access.none;
  const coveredAccess = overview.access.subscribed + overview.access.granted;
  const subscriptionTotal = statuses.reduce((sum, [, count]) => sum + count, 0);
  const billingNeedsAttention = overview.webhooks.failed > 0 || Boolean(overview.webhooks.lastError);

  return (
    <div className="space-y-8">
      <section aria-labelledby="access-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Business snapshot</p>
            <h2 id="access-heading" className="mt-1 text-lg font-semibold tracking-tight">Access and revenue</h2>
          </div>
          <Link href="/admin/users" className="hidden text-sm font-medium text-emerald-700 hover:text-emerald-900 sm:inline dark:text-emerald-400 dark:hover:text-emerald-300">Manage users</Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-8">
            <CardHeader>
              <CardTitle>Account access</CardTitle>
              <CardDescription>{coveredAccess} of {accessTotal} accounts can use the question bank.</CardDescription>
              <CardAction><UserCheck className="size-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" /></CardAction>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 divide-x rounded-xl border bg-muted/30 py-4 text-center">
                <div className="px-2">
                  <p className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{overview.access.subscribed}</p>
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Subscribed</p>
                </div>
                <div className="px-2">
                  <p className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{overview.access.granted}</p>
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Free grants</p>
                </div>
                <div className="px-2">
                  <p className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{overview.access.none}</p>
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">No access</p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium">Access mix</span>
                  <span className="text-muted-foreground">{accessTotal ? Math.round((coveredAccess / accessTotal) * 100) : 0}% covered</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-label={[overview.access.subscribed + " subscribed", overview.access.granted + " free grants", overview.access.none + " without access"].join(", ")}>
                  <span className="bg-emerald-600" style={{ width: (accessTotal ? (overview.access.subscribed / accessTotal) * 100 : 0) + "%" }} />
                  <span className="bg-cyan-500" style={{ width: (accessTotal ? (overview.access.granted / accessTotal) * 100 : 0) + "%" }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-600" />Paid</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-cyan-500" />Granted</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-slate-200 dark:bg-slate-700" />No access</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 text-white ring-emerald-900/20 lg:col-span-4">
            <CardHeader>
              <CardTitle className="text-sm text-emerald-100">Estimated monthly revenue</CardTitle>
              <CardAction><CircleDollarSign className="size-5 text-emerald-200" aria-hidden="true" /></CardAction>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-end">
              <p className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{formatCad(overview.mrrCad)}</p>
              <p className="mt-3 text-sm leading-6 text-emerald-100">Active plans normalised per month, before tax.</p>
              <div className="mt-5 border-t border-white/15 pt-4 text-sm text-emerald-50">
                {overview.planCounts.map((entry) => entry.count + " " + entry.plan.toLowerCase()).join(" · ") || "No paid plans yet"}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="operations-heading">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">At a glance</p>
          <h2 id="operations-heading" className="mt-1 text-lg font-semibold tracking-tight">Operations</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Accounts" value={overview.users.total} hint={overview.users.last7Days + " new in 7 days"} icon={UsersRound} href="/admin/users" tone="blue" />
          <Stat label="Questions" value={overview.questions.total} hint={overview.questions.approved + " reviewed and rights-approved"} icon={FileQuestion} href="/admin/questions" tone="emerald" />
          <Stat label="Access requests" value={overview.requests.total} hint={overview.requests.last30Days + " received in 30 days"} icon={TicketCheck} href="/admin/requests" tone="slate" />
          <Stat label="Unconfirmed" value={overview.users.unconfirmed} hint="Accounts awaiting email confirmation" icon={MailWarning} href="/admin/users" tone={overview.users.unconfirmed ? "amber" : "slate"} />
        </div>
      </section>

      <section aria-label="Billing details" className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Subscription statuses</CardTitle>
            <CardDescription>Latest Stripe status for each account, including lapsed plans.</CardDescription>
            <CardAction><CreditCard className="size-5 text-muted-foreground" aria-hidden="true" /></CardAction>
          </CardHeader>
          <CardContent>
            {statuses.length ? (
              <ul className="space-y-4">
                {statuses.map(([status, count]) => (
                  <li key={status}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{status.replaceAll("_", " ")}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={status === "active" || status === "trialing" ? "h-full rounded-full bg-emerald-600" : "h-full rounded-full bg-slate-400"} style={{ width: (subscriptionTotal ? (count / subscriptionTotal) * 100 : 0) + "%" }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No subscriptions yet.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Billing health</CardTitle>
            <CardDescription>Enforcement and Stripe webhook delivery.</CardDescription>
            <CardAction>
              {billingNeedsAttention ? <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100">Needs attention</Badge> : <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Healthy</Badge>}
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><ShieldAlert className="size-4" aria-hidden="true" />Enforcement</dt>
                <dd className="mt-2 text-sm font-semibold">{overview.billing.required ? "On" : "Off"}</dd>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Settings2 className="size-4" aria-hidden="true" />Grace period</dt>
                <dd className="mt-2 text-sm font-semibold">{overview.billing.graceDays} days</dd>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Webhook className="size-4" aria-hidden="true" />Webhook events</dt>
                <dd className="mt-2 text-sm font-semibold">{overview.webhooks.total} total, {overview.webhooks.failed} failed</dd>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><UserCheck className="size-4" aria-hidden="true" />Last event</dt>
                <dd className="mt-2 text-sm font-semibold">{formatDate(overview.webhooks.lastReceivedAt)}</dd>
              </div>
            </dl>
            {overview.webhooks.lastError ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{overview.webhooks.lastError}</div> : null}
            <Link href="/admin/settings" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"><Settings2 className="size-4" aria-hidden="true" />Review billing settings</Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
