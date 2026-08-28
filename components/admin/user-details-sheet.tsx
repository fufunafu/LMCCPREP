"use client";

import { CreditCard, Settings2, ShieldCheck } from "lucide-react";
import { GrantForm } from "@/components/admin/grant-form";
import { RoleForm } from "@/components/admin/role-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { UserRole } from "@/lib/admin-core";

type UserDetailsSheetProps = {
  userId: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  roleLocked: boolean;
  permissions: readonly string[];
  access: "subscription" | "grant" | "none";
  plan: string | null;
  billingSummary: string | null;
  grantReason: string | null;
  grantExpiresAt: string | null;
  grantExpiresLabel: string | null;
  hasGrant: boolean;
};

function AccessBadge({ access, plan }: Pick<UserDetailsSheetProps, "access" | "plan">) {
  if (access === "subscription") {
    return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{plan ?? "Subscribed"}</Badge>;
  }
  if (access === "grant") {
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200">Complimentary</Badge>;
  }
  return <Badge variant="secondary">No access</Badge>;
}

export function UserDetailsSheet({
  userId,
  email,
  displayName,
  role,
  roleLocked,
  permissions,
  access,
  plan,
  billingSummary,
  grantReason,
  grantExpiresAt,
  grantExpiresLabel,
  hasGrant,
}: UserDetailsSheetProps) {
  return (
    <Sheet>
      <SheetTrigger render={<Button type="button" size="sm" variant="ghost" aria-label={`Manage ${email}`} />}>
        <Settings2 aria-hidden="true" />
        Manage
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="break-all">{displayName ?? email}</SheetTitle>
          <SheetDescription className="break-all">{displayName ? email : "Account permissions and billing access"}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          <section aria-labelledby={`role-${userId}`}>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 id={`role-${userId}`} className="text-sm font-medium">Role and permissions</h2>
                <p className="text-xs text-muted-foreground">Controls administrative capabilities.</p>
              </div>
            </div>
            <RoleForm userId={userId} role={role} locked={roleLocked} />
            <ul className="mt-3 space-y-2 rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              {permissions.map((permission) => <li key={permission} className="flex gap-2"><span aria-hidden="true">•</span><span>{permission}</span></li>)}
            </ul>
          </section>

          <section aria-labelledby={`billing-${userId}`} className="border-t pt-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <CreditCard className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 id={`billing-${userId}`} className="text-sm font-medium">Billing access</h2>
                <p className="text-xs text-muted-foreground">Subscription and complimentary access controls.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AccessBadge access={access} plan={plan} />
              {billingSummary ? <span className="text-xs text-muted-foreground">{billingSummary}</span> : null}
            </div>
            {grantReason ? <p className="mt-3 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Reason:</span> {grantReason}</p> : null}
            {grantExpiresLabel ? <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Expires:</span> {grantExpiresLabel}</p> : null}
            <div className="mt-4">
              <GrantForm userId={userId} hasGrant={hasGrant} reason={grantReason} expiresAt={grantExpiresAt} />
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
