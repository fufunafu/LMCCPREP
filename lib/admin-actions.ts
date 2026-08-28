"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Create or update a complimentary access grant. An empty expiry never expires. */
export async function setAccessGrant(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || "admin_panel";
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  if (!isUuid(userId)) throw new Error("Invalid account.");
  let expiresAt: string | null = null;
  if (expiresRaw) {
    const parsed = new Date(`${expiresRaw}T23:59:59Z`);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid expiry date.");
    expiresAt = parsed.toISOString();
  }
  const { error } = await admin
    .from("billing_access_grants")
    .upsert({ user_id: userId, reason, expires_at: expiresAt }, { onConflict: "user_id" });
  if (error) throw new Error("Could not save the grant.");
  revalidatePath("/admin");
  revalidatePath("/admin/users");
}

export async function revokeAccessGrant(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!isUuid(userId)) throw new Error("Invalid account.");
  const { error } = await admin.from("billing_access_grants").delete().eq("user_id", userId);
  if (error) throw new Error("Could not revoke the grant.");
  revalidatePath("/admin");
  revalidatePath("/admin/users");
}
