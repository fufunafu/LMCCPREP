import { CreditCard, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { GrantForm } from "@/components/admin/grant-form";
import { RoleForm } from "@/components/admin/role-form";
import { formatDate } from "@/components/admin/stat";
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
              <TableHead>Role and permissions</TableHead>
              <TableHead>Billing access</TableHead>
              <TableHead>Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="min-w-56 align-top">
                  <div className="font-medium">{user.email}{!user.confirmed ? <Badge variant="outline" className="ml-2">Unconfirmed</Badge> : null}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <UserRound className="size-3.5" aria-hidden="true" />
                    <span>{user.displayName ?? "No display name"}</span>
                    {user.stripeCustomerId ? <><span>·</span><a className="underline underline-offset-2" href={"https://dashboard.stripe.com/customers/" + user.stripeCustomerId} target="_blank" rel="noreferrer">Stripe</a></> : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-56 align-top">
                  <RoleForm userId={user.id} role={user.role} locked={user.roleSource === "environment"} />
                  <p className="mt-2 max-w-64 text-xs leading-5 text-muted-foreground">
                    {permissionsForRole(user.role).join(" · ")}
                  </p>
                </TableCell>
                <TableCell className="min-w-72 align-top">
                  <AccessBadge user={user} />
                  {user.subscriptionStatus ? <p className="mt-2 text-xs capitalize text-muted-foreground">{user.subscriptionStatus.replaceAll("_", " ")} until {formatDate(user.accessUntil)}</p> : null}
                  {user.access === "grant" && user.grantReason ? <p className="mt-2 text-xs text-muted-foreground">Reason: {user.grantReason}</p> : null}
                  <div className="mt-3">
                    <GrantForm userId={user.id} hasGrant={Boolean(user.grantReason !== null || user.grantExpiresAt)} reason={user.grantReason} expiresAt={user.grantExpiresAt} />
                    {user.grantExpiresAt ? <p className="mt-2 text-xs text-muted-foreground">Expires {formatDate(user.grantExpiresAt)}</p> : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-40 align-top text-xs">
                  <p><span className="text-muted-foreground">Joined:</span> {formatDate(user.createdAt)}</p>
                  <p className="mt-2"><span className="text-muted-foreground">Last sign-in:</span> {formatDate(user.lastSignInAt)}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
