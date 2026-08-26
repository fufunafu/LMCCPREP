import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const categories = {
  existing_user: {
    days: 90,
    reason: "Launch complimentary access: existing invited user (90 days)",
  },
  reviewer: {
    days: 180,
    reason: "Launch complimentary access: reviewer (180 days)",
  },
  administrator: {
    days: null,
    reason: "Launch complimentary access: administrator (non-expiring)",
  },
};

function option(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function usage() {
  console.log(`Usage:
  npm run billing:grants -- --prepare /private/path/grants.json
  npm run billing:grants -- --file /private/path/grants.json --activation 2026-09-01T04:00:00Z
  npm run billing:grants -- --file /private/path/grants.json --activation 2026-09-01T04:00:00Z --apply --confirm APPLY_BILLING_GRANTS

The command is a dry run unless both --apply and the exact confirmation are present.
Temporary grants are calculated from the explicit activation timestamp.
Administrator grants do not expire.`);
}

function fingerprint(email) {
  return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

function isBillingTestUser(user) {
  const purpose = String(user.user_metadata?.purpose ?? "").toLowerCase();
  return purpose.includes("billing") && purpose.includes("test");
}

function parseActivation(raw, needsActivation) {
  if (!needsActivation && !raw) return null;
  if (!raw) throw new Error("--activation is required for temporary grants.");
  const activation = new Date(raw);
  if (!Number.isFinite(activation.getTime())) throw new Error("--activation must be a valid ISO timestamp.");
  return activation;
}

function plannedExpiry(category, activation) {
  const days = categories[category].days;
  if (days === null) return null;
  return new Date(activation.getTime() + days * 86_400_000).toISOString();
}

function preservesExisting(existingExpiry, requestedExpiry) {
  if (existingExpiry === null) return true;
  if (requestedExpiry === null) return false;
  return new Date(existingExpiry).getTime() >= new Date(requestedExpiry).getTime();
}

async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

if (process.argv.includes("--help")) {
  usage();
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceRole) throw new Error("Supabase server configuration is missing.");

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const users = await listAllUsers(admin);

const prepare = option("--prepare");
if (prepare) {
  const ownerEmail = process.env.CAPTURE_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) throw new Error("CAPTURE_OWNER_EMAIL is required to classify the administrator.");
  const prepared = users
    .filter((user) => user.email && !isBillingTestUser(user))
    .map((user) => ({
      email: user.email.toLowerCase(),
      category: user.email.toLowerCase() === ownerEmail ? "administrator" : "existing_user",
    }));
  if (!prepared.some((entry) => entry.category === "administrator")) {
    throw new Error("No authenticated user matches CAPTURE_OWNER_EMAIL.");
  }
  await writeFile(prepare, `${JSON.stringify({ grants: prepared }, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(prepare, 0o600);
  console.log(JSON.stringify({
    prepared: prepared.length,
    administrators: prepared.filter((entry) => entry.category === "administrator").length,
    existingUsers: prepared.filter((entry) => entry.category === "existing_user").length,
    reviewers: 0,
    excludedBillingTestUsers: users.filter(isBillingTestUser).length,
    output: prepare,
  }, null, 2));
  console.log("Review the private manifest and change any reviewer classifications before applying it.");
  process.exit(0);
}

const file = option("--file");
if (!file) {
  usage();
  throw new Error("--file is required.");
}

const parsed = JSON.parse(await readFile(file, "utf8"));
const entries = Array.isArray(parsed) ? parsed : parsed?.grants;
if (!Array.isArray(entries) || entries.length === 0) throw new Error("The grant manifest must contain a non-empty grants array.");

const normalized = entries.map((entry, index) => {
  const email = typeof entry?.email === "string" ? entry.email.trim().toLowerCase() : "";
  const category = typeof entry?.category === "string" ? entry.category.trim() : "";
  if (!email || !email.includes("@")) throw new Error(`Grant ${index + 1} has an invalid email.`);
  if (!Object.hasOwn(categories, category)) throw new Error(`Grant ${index + 1} has an invalid category.`);
  return { email, category };
});

const duplicateEmails = normalized.filter((entry, index) => normalized.findIndex((candidate) => candidate.email === entry.email) !== index);
if (duplicateEmails.length) throw new Error("The grant manifest contains duplicate emails.");

const activation = parseActivation(
  option("--activation"),
  normalized.some((entry) => categories[entry.category].days !== null),
);
const apply = process.argv.includes("--apply");
if (apply && option("--confirm") !== "APPLY_BILLING_GRANTS") {
  throw new Error("Applying grants requires --confirm APPLY_BILLING_GRANTS.");
}

const usersByEmail = new Map(users.map((user) => [(user.email ?? "").toLowerCase(), user]));
const targets = normalized.map((entry) => {
  const user = usersByEmail.get(entry.email);
  if (!user) throw new Error(`No authenticated user matches grant ${fingerprint(entry.email)}.`);
  if (isBillingTestUser(user)) {
    throw new Error(`Grant ${fingerprint(entry.email)} is a billing-test account and cannot receive complimentary access.`);
  }
  return {
    ...entry,
    userId: user.id,
    fingerprint: fingerprint(entry.email),
    expiresAt: plannedExpiry(entry.category, activation),
  };
});

const { data: existingRows, error: existingError } = await admin
  .from("billing_access_grants")
  .select("user_id,reason,expires_at")
  .in("user_id", targets.map((target) => target.userId));
if (existingError) throw existingError;
const existingByUser = new Map((existingRows ?? []).map((row) => [row.user_id, row]));

const plan = targets.map((target) => {
  const existing = existingByUser.get(target.userId);
  const keepExisting = Boolean(existing && preservesExisting(existing.expires_at, target.expiresAt));
  return {
    ...target,
    action: keepExisting ? "preserve" : existing ? "extend" : "create",
    effectiveExpiry: keepExisting ? existing.expires_at : target.expiresAt,
  };
});

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  activation: activation?.toISOString() ?? null,
  totals: {
    requested: plan.length,
    create: plan.filter((item) => item.action === "create").length,
    extend: plan.filter((item) => item.action === "extend").length,
    preserve: plan.filter((item) => item.action === "preserve").length,
  },
  grants: plan.map((item) => ({
    account: item.fingerprint,
    category: item.category,
    action: item.action,
    expiresAt: item.effectiveExpiry,
  })),
}, null, 2));

if (!apply) {
  console.log("Dry run complete. No billing grant was changed.");
  process.exit(0);
}

for (const item of plan) {
  if (item.action === "preserve") continue;
  const { error } = await admin.from("billing_access_grants").upsert({
    user_id: item.userId,
    reason: categories[item.category].reason,
    expires_at: item.expiresAt,
  }, { onConflict: "user_id" });
  if (error) throw error;
}

console.log(`Applied ${plan.filter((item) => item.action !== "preserve").length} billing grant change(s).`);
