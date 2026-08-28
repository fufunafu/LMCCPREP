// Flip database billing enforcement: `node scripts/set-billing-required.mjs on|off`.
// Uses the server-only Supabase role from .env.local. Prints the resulting row.
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
if (mode !== "on" && mode !== "off") {
  console.error("Usage: node --env-file=.env.local scripts/set-billing-required.mjs on|off");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin
  .from("billing_settings")
  .update({ billing_required: mode === "on" })
  .eq("id", true)
  .select("billing_required,grace_days")
  .single();
if (error) {
  console.error("Could not update billing_settings:", error.message);
  process.exit(1);
}
console.log(JSON.stringify({ billing_required: data.billing_required, grace_days: data.grace_days }));
