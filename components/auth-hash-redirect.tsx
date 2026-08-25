"use client";

import { useEffect } from "react";

/** Supabase email links can land on the site root with tokens in the URL fragment; hand them to /auth/finish. */
export function AuthHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token=") && !window.location.pathname.startsWith("/auth/finish")) {
      window.location.replace(`/auth/finish${hash}`);
    }
  }, []);
  return null;
}
