import { Environment, Status, Type, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import { APPLE_BUNDLE_ID, APPLE_GROUP_ID, appleProducts } from "./catalog";

export class ApplePurchaseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Called only after Apple's library has verified the signature and certificate chain. */
export function appleEntitlement(transaction: JWSTransactionDecodedPayload, renewal?: JWSRenewalInfoDecodedPayload, status?: number) {
  const product = transaction.productId ? appleProducts[transaction.productId] : undefined;
  if (!product || transaction.bundleId !== APPLE_BUNDLE_ID || transaction.subscriptionGroupIdentifier !== APPLE_GROUP_ID
      || transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION
      || ![Environment.PRODUCTION, Environment.SANDBOX].includes(transaction.environment as Environment)
      || !transaction.originalTransactionId || !transaction.transactionId
      || !transaction.appAccountToken || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transaction.appAccountToken)
      || !Number.isFinite(transaction.expiresDate) || !Number.isFinite(transaction.signedDate)
      || !Number.isFinite(transaction.purchaseDate)) {
    throw new ApplePurchaseError("This purchase is not a supported Montreal QBank subscription.");
  }
  if (renewal && (renewal.originalTransactionId !== transaction.originalTransactionId || renewal.environment !== transaction.environment)) {
    throw new ApplePurchaseError("Subscription renewal information does not match the purchase.");
  }
  const revoked = transaction.revocationDate != null || transaction.isUpgraded === true || status === Status.REVOKED;
  let accessUntil = transaction.expiresDate!;
  if (status === Status.BILLING_GRACE_PERIOD && renewal?.gracePeriodExpiresDate) {
    accessUntil = Math.max(accessUntil, renewal.gracePeriodExpiresDate);
  }
  if (revoked || status === Status.EXPIRED || status === Status.BILLING_RETRY) accessUntil = 0;
  return {
    environment: transaction.environment as "Production" | "Sandbox",
    originalTransactionId: transaction.originalTransactionId,
    transactionId: transaction.transactionId,
    userId: transaction.appAccountToken.toLowerCase(),
    productId: transaction.productId!, examId: product.examId,
    expiresAt: new Date(transaction.expiresDate!).toISOString(),
    accessUntil: new Date(accessUntil).toISOString(),
    signedAt: new Date(Math.max(transaction.signedDate!, renewal?.signedDate ?? 0)).toISOString(),
    purchaseAt: new Date(transaction.purchaseDate!).toISOString(), revoked,
    autoRenew: renewal?.autoRenewStatus === 1,
  };
}
