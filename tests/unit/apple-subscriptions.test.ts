import { describe, expect, it } from "vitest";
import { Environment, Status, Type, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { appleEntitlement } from "@/lib/apple/entitlement";
import { signedBody } from "@/lib/apple/http";
import { APPLE_BUNDLE_ID, APPLE_GROUP_ID } from "@/lib/apple/catalog";
const purchase: JWSTransactionDecodedPayload = {
  bundleId: APPLE_BUNDLE_ID, subscriptionGroupIdentifier: APPLE_GROUP_ID,
  productId: "ca.lmccprep.app.mccqe.monthly", type: Type.AUTO_RENEWABLE_SUBSCRIPTION,
  environment: Environment.PRODUCTION, originalTransactionId: "original", transactionId: "renewal",
  appAccountToken: "00000000-0000-4000-8000-000000000001",
  expiresDate: 2000000000000, signedDate: 1900000000000, purchaseDate: 1890000000000,
};
describe("verified Apple entitlement mapping", () => {
  it("derives the exam from the allowlisted product", () => {
    expect(appleEntitlement(purchase).examId).toBe("mccqe");
    expect(() => appleEntitlement({ ...purchase, productId: "ca.lmccprep.app.usmle.annual" })).toThrow();
  });
  it.each([
    { productId: "unknown" }, { bundleId: "another.app" }, { subscriptionGroupIdentifier: "wrong" },
    { appAccountToken: undefined }, { appAccountToken: "not-a-uuid" }, { expiresDate: undefined },
    { environment: Environment.XCODE }, { type: Type.CONSUMABLE }, { transactionId: undefined },
  ])("rejects unsupported or incomplete purchase %j", (change) => {
    expect(() => appleEntitlement({ ...purchase, ...change })).toThrow();
  });
  it.each([Status.EXPIRED, Status.BILLING_RETRY, Status.REVOKED])("denies inactive status %s", (status) => {
    expect(appleEntitlement(purchase, undefined, status).accessUntil).toBe(new Date(0).toISOString());
  });
  it("does not grant paid grace time merely because auto renew is enabled", () => {
    expect(appleEntitlement(purchase).accessUntil).toBe(new Date(purchase.expiresDate!).toISOString());
  });
  it("uses only verified matching renewal grace information", () => {
    const renewal = { originalTransactionId: "original", environment: Environment.PRODUCTION, gracePeriodExpiresDate: 2100000000000 };
    expect(appleEntitlement(purchase, renewal, Status.BILLING_GRACE_PERIOD).accessUntil).toBe(new Date(2100000000000).toISOString());
    expect(() => appleEntitlement(purchase, { ...renewal, originalTransactionId: "other" }, Status.BILLING_GRACE_PERIOD)).toThrow();
  });
  it.each([{ revocationDate: 1900000000000 }, { isUpgraded: true }])("denies revoked or superseded transactions", (change) => {
    expect(appleEntitlement({ ...purchase, ...change }).accessUntil).toBe(new Date(0).toISOString());
  });
  it("keeps Sandbox explicitly separate", () => {
    expect(appleEntitlement({ ...purchase, environment: Environment.SANDBOX }).environment).toBe("Sandbox");
  });
});
describe("Apple request validation", () => {
  it("accepts a signed payload field", async () => {
    await expect(signedBody(new Request("https://example.test", {method:"POST",body:JSON.stringify({signedPayload:"a.b.c"})}), "signedPayload")).resolves.toBe("a.b.c");
  });
  it("rejects oversized bodies without trusting Content-Length", async () => {
    await expect(signedBody(new Request("https://example.test", {method:"POST",body:"a".repeat(40001)}), "signedPayload")).rejects.toThrow("too large");
  });
});
