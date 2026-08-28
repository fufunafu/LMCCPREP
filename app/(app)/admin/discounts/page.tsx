import { BadgePercent, CircleCheck, ExternalLink, TicketPercent } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { formatDate } from "@/components/admin/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createDiscount, deactivateDiscount } from "@/lib/admin-actions";
import { listAdminDiscounts } from "@/lib/admin-discounts";
import { billingCheckoutMode } from "@/lib/billing-core";

export default async function AdminDiscountsPage() {
  const { configured, discounts } = await listAdminDiscounts();
  const active = discounts.filter((discount) => discount.active);
  const redemptions = discounts.reduce((sum, discount) => sum + discount.timesRedeemed, 0);
  const checkoutMode = billingCheckoutMode();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-start justify-between p-4"><div><p className="text-2xl font-semibold">{active.length}</p><p className="mt-1 text-sm font-medium">Active codes</p><p className="mt-1 text-xs text-muted-foreground">Currently redeemable</p></div><TicketPercent className="size-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" /></CardContent></Card>
        <Card><CardContent className="flex items-start justify-between p-4"><div><p className="text-2xl font-semibold">{redemptions}</p><p className="mt-1 text-sm font-medium">Redemptions</p><p className="mt-1 text-xs text-muted-foreground">Across listed promotion codes</p></div><CircleCheck className="size-5 text-blue-700 dark:text-blue-400" aria-hidden="true" /></CardContent></Card>
        <Card><CardContent className="flex items-start justify-between p-4"><div><p className="text-2xl font-semibold capitalize">{checkoutMode ?? "Unavailable"}</p><p className="mt-1 text-sm font-medium">Checkout mode</p><p className="mt-1 text-xs text-muted-foreground">{checkoutMode === "links" ? "Enable codes on each Payment Link" : checkoutMode === "api" ? "Codes appear in Stripe Checkout" : "Configure Stripe billing first"}</p></div><BadgePercent className="size-5 text-violet-700 dark:text-violet-400" aria-hidden="true" /></CardContent></Card>
      </div>

      {!configured ? (
        <Card>
          <CardHeader>
            <CardTitle>Stripe API management is unavailable</CardTitle>
            <CardDescription>This deployment can still use hosted Payment Link discounts, but it cannot list or create Stripe promotion codes from the admin panel.</CardDescription>
          </CardHeader>
          <CardContent>
            <a href="https://dashboard.stripe.com/coupons" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400">Manage discounts in Stripe <ExternalLink className="size-4" aria-hidden="true" /></a>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create a promotion code</CardTitle>
            <CardDescription>Create a percentage discount backed by a Stripe coupon. Codes are case-insensitive at checkout.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createDiscount} success="Promotion code created" reset className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-medium">Customer code
                <input name="code" required minLength={3} maxLength={32} pattern="[A-Za-z0-9-]+" placeholder="WELCOME20" className="mt-1.5 h-9 w-full rounded-lg border bg-background px-3 text-sm uppercase" />
              </label>
              <label className="text-xs font-medium">Percentage off
                <input name="percentOff" required type="number" min="1" max="100" step="0.01" placeholder="20" className="mt-1.5 h-9 w-full rounded-lg border bg-background px-3 text-sm" />
              </label>
              <label className="text-xs font-medium">Duration
                <select name="duration" defaultValue="once" className="mt-1.5 h-9 w-full rounded-lg border bg-background px-3 text-sm">
                  <option value="once">First invoice</option>
                  <option value="repeating">Several months</option>
                  <option value="forever">Subscription lifetime</option>
                </select>
              </label>
              <label className="text-xs font-medium">Months if repeating
                <input name="durationMonths" type="number" min="1" max="36" placeholder="3" className="mt-1.5 h-9 w-full rounded-lg border bg-background px-3 text-sm" />
              </label>
              <label className="text-xs font-medium">Maximum redemptions
                <input name="maxRedemptions" type="number" min="1" placeholder="Unlimited" className="mt-1.5 h-9 w-full rounded-lg border bg-background px-3 text-sm" />
              </label>
              <label className="text-xs font-medium">Expires
                <input name="expiresAt" type="date" className="mt-1.5 h-9 w-full rounded-lg border bg-background px-3 text-sm" />
              </label>
              <label className="flex h-9 items-center gap-2 self-end text-sm">
                <input name="firstTimeOnly" type="checkbox" className="size-4 rounded border" />
                First-time customers only
              </label>
              <Button type="submit" className="h-9 self-end bg-emerald-800 text-white hover:bg-emerald-900">Create code</Button>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Promotion codes</CardTitle>
          <CardDescription>Live Stripe promotion codes, their limits, and redemption activity.</CardDescription>
        </CardHeader>
        <CardContent>
          {discounts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-4xl text-left text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="pb-3 font-medium">Code</th><th className="pb-3 font-medium">Offer</th><th className="pb-3 font-medium">Duration</th><th className="pb-3 font-medium">Usage</th><th className="pb-3 font-medium">Expires</th><th className="pb-3 text-right font-medium">Status</th></tr></thead>
                <tbody className="divide-y">
                  {discounts.map((discount) => (
                    <tr key={discount.id}>
                      <td className="py-4 font-mono font-semibold">{discount.code}</td>
                      <td className="py-4">{discount.offer}{discount.firstTimeOnly ? <p className="mt-1 text-xs text-muted-foreground">First-time customers</p> : null}</td>
                      <td className="py-4 text-muted-foreground">{discount.duration}</td>
                      <td className="py-4">{discount.timesRedeemed}{discount.maxRedemptions ? " of " + discount.maxRedemptions : ""}</td>
                      <td className="py-4 text-muted-foreground">{discount.expiresAt ? formatDate(discount.expiresAt) : "No expiry"}</td>
                      <td className="py-4 text-right">
                        {discount.active ? (
                          <ActionForm action={deactivateDiscount} success="Promotion code deactivated" confirm={"Deactivate " + discount.code + "? This prevents future redemptions."} className="inline-flex items-center gap-2">
                            <input type="hidden" name="promotionCodeId" value={discount.id} />
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Active</Badge>
                            <Button type="submit" size="sm" variant="ghost">Deactivate</Button>
                          </ActionForm>
                        ) : <Badge variant="secondary">Inactive</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">No promotion codes found.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
