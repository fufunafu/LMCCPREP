import "server-only";

import { cache } from "react";
import { isAdminEmail } from "@/lib/admin-core";
import { isDemoSession } from "@/lib/demo-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin access is an explicit email allowlist (`ADMIN_EMAILS`, comma separated).
 * The demo session is never an admin. Callers hide the panel (404) when false.
 */
export const isAdmin = cache(async () => {
  if (await isDemoSession()) return false;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  return isAdminEmail(email, process.env.ADMIN_EMAILS);
});

/** Server actions and loaders call this first; it returns the service-role client. */
export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Administrator access is required.");
  return createAdminClient();
}
