import "server-only";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, VerificationException, VerificationStatus } from "@apple/app-store-server-library";
import { createAdminClient } from "@/lib/supabase/admin";
import { APPLE_APP_ID, APPLE_BUNDLE_ID } from "./catalog";
import { appleRootCertificates } from "./certificates";
import { appleEntitlement, ApplePurchaseError } from "./entitlement";

const verifiers = new Map<Environment, SignedDataVerifier>();
function verifier(environment: Environment) {
  let instance = verifiers.get(environment);
  if (!instance) {
    instance = new SignedDataVerifier(appleRootCertificates, true, environment, APPLE_BUNDLE_ID, APPLE_APP_ID);
    verifiers.set(environment, instance);
  }
  return instance;
}

async function verified<T>(signed: string, decode: (v: SignedDataVerifier) => Promise<T>): Promise<T> {
  if (typeof signed !== "string" || signed.length > 32_000 || signed.split(".").length !== 3) throw new ApplePurchaseError("Invalid signed purchase.");
  try { return await decode(verifier(Environment.PRODUCTION)); }
  catch (error) {
    // Apple's Sandbox TEST payload omits appAppleId, so the Production verifier
    // can reject its identity before checking its environment. The Sandbox
    // verifier still checks the full signature, bundle and Sandbox environment.
    if (!(error instanceof VerificationException) || ![
      VerificationStatus.INVALID_ENVIRONMENT, VerificationStatus.INVALID_APP_IDENTIFIER,
    ].includes(error.status)) throw error;
    return decode(verifier(Environment.SANDBOX));
  }
}
export const verifyTransaction = (signed: string) => verified(signed, (v) => v.verifyAndDecodeTransaction(signed));
export const verifyNotification = (signed: string) => verified(signed, (v) => v.verifyAndDecodeNotification(signed));

function apiClient(environment: Environment) {
  const key = process.env.APPLE_IAP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuer = process.env.APPLE_IAP_ISSUER_ID;
  if (!key || !keyId || !issuer) throw new ApplePurchaseError("Apple purchase verification is temporarily unavailable. Your purchase can be restored later.", 503);
  return new AppStoreServerAPIClient(key, keyId, issuer, APPLE_BUNDLE_ID, environment);
}

export async function saveEntitlement(value: ReturnType<typeof appleEntitlement>) {
  const { error } = await createAdminClient().rpc("sync_apple_subscription", {
    p_environment: value.environment, p_original_transaction_id: value.originalTransactionId,
    p_transaction_id: value.transactionId, p_user_id: value.userId, p_product_id: value.productId,
    p_exam_id: value.examId, p_expires_at: value.expiresAt, p_access_until: value.accessUntil,
    p_signed_at: value.signedAt, p_purchase_at: value.purchaseAt, p_revoked: value.revoked, p_auto_renew: value.autoRenew,
  });
  if (error) throw new ApplePurchaseError("Purchase access could not be saved. Try Restore Purchases shortly.", 503);
}

/** Ask Apple for current state so replaying an old receipt cannot restore refunded access. */
export async function synchronizePurchase(signed: string, userId: string) {
  const transaction = await verifyTransaction(signed);
  const claimed = appleEntitlement(transaction);
  if (claimed.userId !== userId.toLowerCase()) throw new ApplePurchaseError("This Apple subscription belongs to another Montreal QBank account. Sign in to that account to restore it.", 409);
  const environment = transaction.environment as Environment;
  const response = await apiClient(environment).getAllSubscriptionStatuses(claimed.originalTransactionId);
  const v = verifier(environment);
  let matched = false;
  for (const group of response.data ?? []) {
    for (const entry of group.lastTransactions ?? []) {
      if (entry.originalTransactionId !== claimed.originalTransactionId || !entry.signedTransactionInfo) continue;
      const current = await v.verifyAndDecodeTransaction(entry.signedTransactionInfo);
      const renewal = entry.signedRenewalInfo ? await v.verifyAndDecodeRenewalInfo(entry.signedRenewalInfo) : undefined;
      const value = appleEntitlement(current, renewal, entry.status);
      if (value.userId !== claimed.userId) throw new ApplePurchaseError("The subscription account does not match.", 409);
      await saveEntitlement(value);
      matched = true;
    }
  }
  if (!matched) throw new ApplePurchaseError("Apple has not returned this subscription yet. Try Restore Purchases shortly.", 503);
}

export async function processNotification(signed: string) {
  const notification = await verifyNotification(signed);
  if (notification.notificationType === "TEST") return;
  const data = notification.data;
  if (!data?.signedTransactionInfo) return;
  const v = verifier(data.environment as Environment);
  const transaction = await v.verifyAndDecodeTransaction(data.signedTransactionInfo);
  const renewal = data.signedRenewalInfo ? await v.verifyAndDecodeRenewalInfo(data.signedRenewalInfo) : undefined;
  const value = appleEntitlement(transaction, renewal, data.status);
  if (notification.signedDate) value.signedAt = new Date(Math.max(Date.parse(value.signedAt), notification.signedDate)).toISOString();
  // Deletion removes personal data; later renewals must not resurrect accounts.
  const { data: user, error } = await createAdminClient().auth.admin.getUserById(value.userId);
  if (error && error.status !== 404) throw new ApplePurchaseError("Account lookup temporarily unavailable.", 503);
  if (!user?.user) return;
  await saveEntitlement(value);
}
