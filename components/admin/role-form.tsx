"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setUserRole } from "@/lib/admin-actions";
import type { UserRole } from "@/lib/admin-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function RoleForm({ userId, role, locked = false }: { userId: string; role: UserRole; locked?: boolean }) {
  const [selected, setSelected] = useState<UserRole>(role);
  const [pending, startTransition] = useTransition();

  if (locked) {
    return (
      <div>
        <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">Admin</Badge>
        <p className="mt-1 text-[11px] text-muted-foreground">Protected owner role</p>
      </div>
    );
  }

  return (
    <form className="flex items-center gap-2" onSubmit={(event) => {
      event.preventDefault();
      const prompt = selected === "admin"
        ? "Grant administrator permissions and complimentary question-bank access to this account?"
        : "Change this account to the customer role and remove any role-based complimentary access?";
      if (!window.confirm(prompt)) return;
      const data = new FormData();
      data.set("userId", userId);
      data.set("role", selected);
      startTransition(async () => {
        try {
          await setUserRole(data);
          toast.success("Role updated.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "The role change failed.");
          setSelected(role);
        }
      });
    }}>
      <select aria-label="Account role" value={selected} onChange={(event) => setSelected(event.target.value as UserRole)} disabled={pending} className="h-8 rounded-lg border bg-background px-2 text-xs font-medium">
        <option value="customer">Customer</option>
        <option value="admin">Admin</option>
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending || selected === role}>Save</Button>
    </form>
  );
}
