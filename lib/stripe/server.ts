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

export function stripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Stripe webhooks are not configured.");
  return secret;
}
