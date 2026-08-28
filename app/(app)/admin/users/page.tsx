import { GrantForm } from "@/components/admin/grant-form";
import { formatDate } from "@/components/admin/stat";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAdminUsers, type AdminUser } from "@/lib/admin-data";

function AccessBadge({ user }: { user: AdminUser }) {
  if (user.access === "subscription") return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{user.plan ?? "Subscribed"}</Badge>;
  if (user.access === "grant") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200">Free{user.grantReason ? `: ${user.grantReason}` : ""}</Badge>;
  return <Badge variant="secondary">None</Badge>;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; access?: string }> }) {
  const { q, access } = await searchParams;
  const term = q?.trim().toLowerCase() ?? "";
  const users = (await listAdminUsers()).filter((user) => (!term || user.email.toLowerCase().includes(term) || (user.displayName ?? "").toLowerCase().includes(term)) && (!access || user.access === access));
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2 text-sm"><input name="q" defaultValue={q ?? ""} placeholder="Search email or name" className="h-9 rounded-lg border bg-background px-3" /><select name="access" defaultValue={access ?? ""} className="h-9 rounded-lg border bg-background px-3"><option value="">All access</option><option value="subscription">Subscribed</option><option value="grant">Free grant</option><option value="none">No access</option></select><button type="submit" className="h-9 rounded-lg bg-emerald-800 px-3 font-medium text-white hover:bg-emerald-900">Filter</button></form>
      <p className="text-sm text-muted-foreground">{users.length} account{users.length === 1 ? "" : "s"}</p>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Access</TableHead><TableHead>Subscription</TableHead><TableHead>Joined</TableHead><TableHead>Last sign-in</TableHead><TableHead>Free access</TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map((user) => <TableRow key={user.id}>
              <TableCell><div className="font-medium">{user.email}{!user.confirmed && <Badge variant="outline" className="ml-2">unconfirmed</Badge>}</div><div className="text-xs text-muted-foreground">{user.displayName ?? "—"}{user.stripeCustomerId && <> · <a className="underline" href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`} target="_blank" rel="noreferrer">Stripe</a></>}</div></TableCell>
              <TableCell><AccessBadge user={user} /></TableCell>
              <TableCell className="text-xs">{user.subscriptionStatus ? <>{user.subscriptionStatus.replaceAll("_", " ")}{user.cancelAtPeriodEnd ? ", cancels" : ""}<div className="text-muted-foreground">until {formatDate(user.accessUntil)}</div></> : "—"}</TableCell>
              <TableCell className="text-xs">{formatDate(user.createdAt)}</TableCell>
              <TableCell className="text-xs">{formatDate(user.lastSignInAt)}</TableCell>
              <TableCell><GrantForm userId={user.id} hasGrant={Boolean(user.grantReason !== null || user.grantExpiresAt)} reason={user.grantReason} expiresAt={user.grantExpiresAt} />{user.grantExpiresAt && <p className="mt-1 text-xs text-muted-foreground">expires {formatDate(user.grantExpiresAt)}</p>}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
