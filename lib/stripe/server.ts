import "server-only";

import Stripe from "stripe";
import { stripeSecretMatchesEnvironment } from "@/lib/billing-core";

let stripeClient: Stripe | undefined;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("Stripe billing is not configured.");
  if (!stripeSecretMatchesEnvironment()) throw new Error("The Stripe key mode does not match this deployment environment.");
  stripeClient ??= new Stripe(secretKey, { appInfo: { name: "Montreal QBank" } });
  return stripeClient;
}

/** The Stripe client when an API key is configured for this environment, otherwise undefined. */
export function getOptionalStripe() {
  try {
    return getStripe();
  } catch {
    return undefined;
  }
}

/**
 * Signature verification is local and needs no API key, so hosted "links" mode
 * can verify webhooks without a Stripe secret key.
 */
export function stripeWebhookVerifier() {
  return getOptionalStripe()?.webhooks ?? Stripe.webhooks;
}

export function stripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Stripe webhooks are not configured.");
  return secret;
}
