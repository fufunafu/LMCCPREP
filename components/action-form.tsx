"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Props = { action: (formData: FormData) => Promise<unknown>; success?: string; reset?: boolean; className?: string; children: React.ReactNode; confirm?: string };

/** Form that submits to a server action, surfaces thrown errors as toasts, and refreshes the route. */
export function ActionForm({ action, success = "Saved", reset = false, className, children, confirm }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const form = event.currentTarget;
    setPending(true);
    try {
      const result = await action(new FormData(form));
      toast.success(typeof result === "number" ? `${success} (${result})` : success);
      if (reset) form.reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  };
  return <form onSubmit={submit} className={className} aria-busy={pending}>{children}</form>;
}
