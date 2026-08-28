import { CreditCard, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/components/admin/stat";
import { UserDetailsSheet } from "@/components/admin/user-details-sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { permissionsForRole } from "@/lib/admin-core";
import { listAdminUsers, type AdminUser } from "@/lib/admin-data";

function AccessBadge({ user }: { user: AdminUser }) {
  if (user.access === "subscription") return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{user.plan ?? "Subscribed"}</Badge>;
  if (user.access === "grant") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200">Complimentary</Badge>;
  return <Badge variant="secondary">No access</Badge>;
}

function RoleBadge({ user }: { user: AdminUser }) {
  if (user.role === "admin") return <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">Admin</Badge>;
  return <Badge variant="secondary">Customer</Badge>;
}

function billingSummary(user: AdminUser) {
  if (user.subscriptionStatus) {
    const status = user.subscriptionStatus.replaceAll("_", " ");
    return `${status}${user.cancelAtPeriodEnd ? ", cancels" : ""} until ${formatDate(user.accessUntil)}`;
  }
  if (user.access === "grant") return user.grantExpiresAt ? `until ${formatDate(user.grantExpiresAt)}` : "No expiry";
  return null;
}

function SummaryCard({ label, value, icon: Icon, hint }: { label: string; value: number; icon: typeof UsersRound; hint: string }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-sm font-medium">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
      </CardContent>
    </Card>
  );
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; access?: string; role?: string }> }) {
  const { q, access, role } = await searchParams;
  const term = q?.trim().toLowerCase() ?? "";
  const allUsers = await listAdminUsers();
  const users = allUsers.filter((user) => (
    (!term || user.email.toLowerCase().includes(term) || (user.displayName ?? "").toLowerCase().includes(term))
    && (!access || user.access === access)
    && (!role || user.role === role)
  ));
  const adminCount = allUsers.filter((user) => user.role === "admin").length;
  const customerCount = allUsers.filter((user) => user.role === "customer").length;
  const payingCount = allUsers.filter((user) => user.access === "subscription").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Customers" value={customerCount} icon={UsersRound} hint="Default role for every account" />
        <SummaryCard label="Administrators" value={adminCount} icon={ShieldCheck} hint="Can manage users, billing, and content" />
        <SummaryCard label="Subscribers" value={payingCount} icon={CreditCard} hint="Accounts with active paid access" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="flex flex-1 flex-wrap gap-2 text-sm">
          <input name="q" defaultValue={q ?? ""} placeholder="Search email or name" className="h-9 min-w-56 flex-1 rounded-lg border bg-background px-3" />
          <select name="role" defaultValue={role ?? ""} className="h-9 rounded-lg border bg-background px-3">
            <option value="">All roles</option>
            <option value="customer">Customers</option>
            <option value="admin">Administrators</option>
          </select>
          <select name="access" defaultValue={access ?? ""} className="h-9 rounded-lg border bg-background px-3">
            <option value="">All billing access</option>
            <option value="subscription">Subscribed</option>
            <option value="grant">Complimentary</option>
            <option value="none">No access</option>
          </select>
          <button type="submit" className="h-9 rounded-lg bg-emerald-800 px-4 font-medium text-white hover:bg-emerald-900">Filter</button>
          {q || role || access ? <Link href="/admin/users" className="inline-flex h-9 items-center px-2 text-muted-foreground hover:text-foreground">Clear</Link> : null}
        </form>
        <p className="shrink-0 text-xs text-muted-foreground">{users.length} of {allUsers.length} accounts</p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Billing access</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="min-w-64 py-3 align-middle">
                  <div className="font-medium">{user.email}{!user.confirmed ? <Badge variant="outline" className="ml-2">Unconfirmed</Badge> : null}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <UserRound className="size-3.5" aria-hidden="true" />
                    <span>{user.displayName ?? "No display name"}</span>
                    {user.stripeCustomerId ? <><span>·</span><a className="underline underline-offset-2" href={"https://dashboard.stripe.com/customers/" + user.stripeCustomerId} target="_blank" rel="noreferrer">Stripe</a></> : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-28 py-3 align-middle">
                  <RoleBadge user={user} />
                </TableCell>
                <TableCell className="min-w-52 py-3 align-middle">
                  <div className="flex flex-wrap items-center gap-2">
                    <AccessBadge user={user} />
                    {billingSummary(user) ? <span className="text-xs capitalize text-muted-foreground">{billingSummary(user)}</span> : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-72 py-3 align-middle text-xs">
                  <span className="text-muted-foreground">Joined</span> {formatDate(user.createdAt)}
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">Last sign-in</span> {formatDate(user.lastSignInAt)}
                </TableCell>
                <TableCell className="py-3 text-right align-middle">
                  <UserDetailsSheet
                    userId={user.id}
                    email={user.email}
                    displayName={user.displayName}
                    role={user.role}
                    roleLocked={user.roleSource === "environment"}
                    permissions={permissionsForRole(user.role)}
                    access={user.access}
                    plan={user.plan}
                    billingSummary={billingSummary(user)}
                    grantReason={user.grantReason}
                    grantExpiresAt={user.grantExpiresAt}
                    grantExpiresLabel={user.grantExpiresAt ? formatDate(user.grantExpiresAt) : null}
                    hasGrant={Boolean(user.grantReason !== null || user.grantExpiresAt)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
