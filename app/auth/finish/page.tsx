"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/urls";

/** Completes email-link sign-in when Supabase returns tokens in the URL fragment (implicit flow). */
function Finish() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const type = hash.get("type");
    const next = safeReturnPath(params.get("next"), type === "invite" || type === "recovery" ? "/auth/set-password" : "/dashboard");
    if (!access_token || !refresh_token) {
      router.replace(`/login?error=${encodeURIComponent(hash.get("error_description") ?? "That link is invalid or has expired.")}`);
      return;
    }
    createClient().auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) { setMessage("That link is invalid or has expired."); router.replace(`/login?error=${encodeURIComponent("That link is invalid or has expired.")}`); return; }
      window.location.replace(next);
    });
  }, [params, router]);
  return <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">{message}</main>;
}

export default function FinishPage() {
  return <Suspense><Finish /></Suspense>;
}
