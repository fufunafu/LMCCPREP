import "server-only";

import { cache } from "react";
import { isAdminEmail, roleFromAppMetadata } from "@/lib/admin-core";
import { isDemoSession } from "@/lib/demo-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin access comes from secure Supabase app metadata. The email allowlist is
 * retained as an owner bootstrap and recovery path. The demo is never an admin.
 */
export const isAdmin = cache(async () => {
  if (await isDemoSession()) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return false;
  return isAdminEmail(data.user.email, process.env.ADMIN_EMAILS)
    || roleFromAppMetadata(data.user.app_metadata) === "admin";
});

/** Server actions and loaders call this first; it returns the service-role client. */
export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Administrator access is required.");
  return createAdminClient();
}
