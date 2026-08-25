"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BillingPortalButton({ disabled = false, label = "Manage billing" }: { disabled?: boolean; label?: string }) {
  const [pending, setPending] = useState(false);
  const openPortal = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Could not open billing.");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open billing.");
      setPending(false);
    }
  };
  return <Button type="button" variant="outline" disabled={disabled || pending} onClick={openPortal}><CreditCard />{pending ? "Opening…" : label}</Button>;
}
