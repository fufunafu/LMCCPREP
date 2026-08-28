"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { isAdminEmail, USER_ROLES, type UserRole } from "@/lib/admin-core";
import { getStripe } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

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

/** Assign a secure application role. Missing role metadata always resolves to customer. */
export async function setUserRole(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;
  if (!isUuid(userId)) throw new Error("Invalid account.");
  if (!USER_ROLES.includes(role)) throw new Error("Invalid role.");

  const [{ data: target, error: targetError }, sessionClient] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    createClient(),
  ]);
  if (targetError || !target.user) throw new Error("Could not load the account.");
  if (isAdminEmail(target.user.email, process.env.ADMIN_EMAILS) && role !== "admin") {
    throw new Error("Environment administrators cannot be demoted here.");
  }

  const { data: session } = await sessionClient.auth.getUser();
  if (session.user?.id === userId && role !== "admin") {
    throw new Error("You cannot remove your own administrator role.");
  }

  if (role === "admin") {
    const { data: existingGrant, error: grantReadError } = await admin
      .from("billing_access_grants")
      .select("user_id,expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (grantReadError) throw new Error("Could not check administrator access.");
    const existingGrantIsActive = Boolean(existingGrant && (!existingGrant.expires_at || new Date(existingGrant.expires_at) > new Date()));
    if (!existingGrantIsActive) {
      const { error: grantError } = await admin
        .from("billing_access_grants")
        .upsert({ user_id: userId, reason: "role_admin", expires_at: null }, { onConflict: "user_id" });
      if (grantError) throw new Error("Could not grant administrator access.");
    }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...target.user.app_metadata, role },
  });
  if (error) throw new Error("Could not update the account role.");

  if (role === "customer") {
    const { error: grantError } = await admin
      .from("billing_access_grants")
      .delete()
      .eq("user_id", userId)
      .eq("reason", "role_admin");
    if (grantError) throw new Error("The role changed, but administrator access cleanup failed.");
  }
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/billing");
}

export async function createDiscount(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const percentOff = Number(formData.get("percentOff"));
  const duration = String(formData.get("duration") ?? "");
  const durationMonths = Number(formData.get("durationMonths"));
  const maxRedemptions = Number(formData.get("maxRedemptions"));
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  const firstTimeOnly = formData.get("firstTimeOnly") === "on";

  if (!/^[A-Z0-9-]{3,32}$/.test(code)) throw new Error("Use 3 to 32 letters, numbers, or dashes for the code.");
  if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) throw new Error("Discount percentage must be between 1 and 100.");
  if (!["once", "forever", "repeating"].includes(duration)) throw new Error("Choose a valid duration.");
  if (duration === "repeating" && (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 36)) {
    throw new Error("Repeating discounts must last between 1 and 36 months.");
  }
  if (maxRedemptions && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 100000)) {
    throw new Error("Maximum redemptions must be a positive whole number.");
  }

  let expiresAt: number | undefined;
  if (expiresRaw) {
    const parsed = new Date(expiresRaw + "T23:59:59Z");
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) throw new Error("Expiry must be a future date.");
    expiresAt = Math.floor(parsed.getTime() / 1000);
  }

  const stripe = getStripe();
  try {
    const existing = await stripe.promotionCodes.list({ code, limit: 1 });
    if (existing.data.length) throw new Error("That promotion code already exists, including as an inactive code.");

    const coupon = await stripe.coupons.create({
      name: code + " " + percentOff + "% off",
      percent_off: percentOff,
      duration: duration as "once" | "forever" | "repeating",
      duration_in_months: duration === "repeating" ? durationMonths : undefined,
      metadata: { source: "montreal_qbank_admin" },
    }, { idempotencyKey: "lmcc-coupon-" + code.toLowerCase() });

    await stripe.promotionCodes.create({
      code,
      promotion: { type: "coupon", coupon: coupon.id },
      expires_at: expiresAt,
      max_redemptions: maxRedemptions || undefined,
      restrictions: firstTimeOnly ? { first_time_transaction: true } : undefined,
      metadata: { source: "montreal_qbank_admin" },
    }, { idempotencyKey: "lmcc-promotion-" + code.toLowerCase() });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("That promotion code")) throw error;
    throw new Error("Stripe could not create the promotion code. Review the discount settings and try again.");
  }

  revalidatePath("/admin/discounts");
}

export async function deactivateDiscount(formData: FormData) {
  await requireAdmin();
  const promotionCodeId = String(formData.get("promotionCodeId") ?? "");
  if (!/^promo_[A-Za-z0-9]+$/.test(promotionCodeId)) throw new Error("Invalid promotion code.");
  try {
    await getStripe().promotionCodes.update(promotionCodeId, { active: false });
  } catch {
    throw new Error("Stripe could not deactivate the promotion code.");
  }
  revalidatePath("/admin/discounts");
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
