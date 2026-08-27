"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { requestAccess } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AccessRequestForm() {
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    try {
      const result = await requestAccess(new FormData(form));
      if (!result.demo) form.reset();
      toast.success(result.demo ? "Demo request not sent" : "Access request received", {
        description: result.demo ? "Sign out of the demo to submit an access request." : "Thanks. We will be in touch when an invitation is available.",
      });
    } catch {
      toast.error("Could not send your request", { description: "Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  };
  return <form onSubmit={submit} className="rounded-2xl bg-white p-3 shadow-xl sm:flex"><label className="sr-only" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label><Input type="email" name="email" required aria-label="Email address" placeholder="Your university email" className="h-12 border-0 text-slate-950 shadow-none focus-visible:ring-0" /><Button type="submit" disabled={submitting} className="mt-2 h-12 w-full bg-slate-950 px-5 hover:bg-slate-800 sm:mt-0 sm:w-auto">{submitting ? "Sending…" : "Request access"} <ArrowRight /></Button></form>;
}
