"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { revokeAccessGrant, setAccessGrant } from "@/lib/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Inline grant / revoke controls for one account row in the admin Users table. */
export function GrantForm({ userId, hasGrant, reason, expiresAt }: { userId: string; hasGrant: boolean; reason: string | null; expiresAt: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const run = (action: (data: FormData) => Promise<void>, data: FormData, done: string) => start(async () => {
    try {
      await action(data);
      toast.success(done);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The change failed.");
    }
  });
  if (!open) {
    return <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>{hasGrant ? "Edit grant" : "Grant free access"}</Button>{hasGrant && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { const data = new FormData(); data.set("userId", userId); run(revokeAccessGrant, data, "Grant revoked."); }}>Revoke</Button>}</div>;
  }
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); run(setAccessGrant, new FormData(event.currentTarget), "Grant saved."); }}>
      <input type="hidden" name="userId" value={userId} />
      <label className="text-xs">Reason<Input name="reason" defaultValue={reason ?? ""} placeholder="e.g. beta tester" className="mt-1 h-8 w-40" /></label>
      <label className="text-xs">Expires (blank = never)<Input name="expiresAt" type="date" defaultValue={expiresAt ? expiresAt.slice(0, 10) : ""} className="mt-1 h-8 w-40" /></label>
      <Button type="submit" size="sm" disabled={pending}>Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </form>
  );
}
