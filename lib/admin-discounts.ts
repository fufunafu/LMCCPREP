import "server-only";

import type Stripe from "stripe";
import { requireAdmin } from "@/lib/admin";
import { formatCad } from "@/lib/billing-core";
import { getOptionalStripe } from "@/lib/stripe/server";

export type AdminDiscount = {
  id: string;
  code: string;
  active: boolean;
  offer: string;
  duration: string;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  firstTimeOnly: boolean;
};

function couponForPromotion(code: Stripe.PromotionCode) {
  const coupon = code.promotion.coupon;
  return coupon && typeof coupon !== "string" ? coupon : null;
}

function offerLabel(coupon: Stripe.Coupon | null) {
  if (!coupon) return "Coupon details unavailable";
  if (coupon.percent_off != null) return coupon.percent_off + "% off";
  if (coupon.amount_off != null && coupon.currency) return formatCad(coupon.amount_off / 100) + " off";
  return coupon.name ?? "Discount";
}

function durationLabel(coupon: Stripe.Coupon | null) {
  if (!coupon) return "Unknown duration";
  if (coupon.duration === "forever") return "For the subscription lifetime";
  if (coupon.duration === "repeating") return "For " + (coupon.duration_in_months ?? 0) + " months";
  return "First invoice";
}

export async function listAdminDiscounts() {
  await requireAdmin();
  const stripe = getOptionalStripe();
  if (!stripe) return { configured: false, discounts: [] as AdminDiscount[] };

  const result = await stripe.promotionCodes.list({
    limit: 100,
    expand: ["data.promotion.coupon"],
  });
  return {
    configured: true,
    discounts: result.data.map((code) => {
      const coupon = couponForPromotion(code);
      return {
        id: code.id,
        code: code.code,
        active: code.active,
        offer: offerLabel(coupon),
        duration: durationLabel(coupon),
        timesRedeemed: code.times_redeemed,
        maxRedemptions: code.max_redemptions,
        expiresAt: code.expires_at ? new Date(code.expires_at * 1000).toISOString() : null,
        firstTimeOnly: code.restrictions.first_time_transaction,
      } satisfies AdminDiscount;
    }),
  };
}
