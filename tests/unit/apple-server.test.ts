import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPLE_BUNDLE_ID, APPLE_GROUP_ID } from "@/lib/apple/catalog";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(), renewal: vi.fn(), notification: vi.fn(), statuses: vi.fn(),
  rpc: vi.fn(), user: vi.fn(), environments: [] as string[],
}));
vi.mock("@apple/app-store-server-library", async (original) => {
  const actual = await original<typeof import("@apple/app-store-server-library")>();
  return {
    ...actual,
    SignedDataVerifier: class {
      constructor(_roots: unknown, _online: unknown, private environment: string) {}
      verifyAndDecodeTransaction(signed: string) { mock.environments.push(this.environment); return mock.transaction(signed, this.environment); }
      verifyAndDecodeRenewalInfo = mock.renewal;
      verifyAndDecodeNotification = mock.notification;
    },
    AppStoreServerAPIClient: class { getAllSubscriptionStatuses = mock.statuses; },
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: mock.rpc, auth: { admin: { getUserById: mock.user } },
}) }));
import { Environment, Status, Type, VerificationException, VerificationStatus } from "@apple/app-store-server-library";
import { processNotification, synchronizePurchase, verifyTransaction } from "@/lib/apple/server";

const userId = "00000000-0000-4000-8000-000000000001";
const transaction = {
  bundleId: APPLE_BUNDLE_ID, subscriptionGroupIdentifier: APPLE_GROUP_ID,
  productId: "ca.lmccprep.app.mccqe.monthly", type: Type.AUTO_RENEWABLE_SUBSCRIPTION,
  environment: Environment.PRODUCTION, originalTransactionId: "original", transactionId: "renewal",
  appAccountToken: userId, expiresDate: 2_000_000_000_000,
  signedDate: 1_900_000_000_000, purchaseDate: 1_890_000_000_000,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.environments.length = 0;
  vi.stubEnv("APPLE_IAP_PRIVATE_KEY", "test-key");
  vi.stubEnv("APPLE_IAP_KEY_ID", "test-id");
  vi.stubEnv("APPLE_IAP_ISSUER_ID", "test-issuer");
  mock.transaction.mockResolvedValue(transaction);
  mock.rpc.mockResolvedValue({ error: null });
  mock.user.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mock.statuses.mockResolvedValue({ data: [{ lastTransactions: [{
    originalTransactionId: "original", signedTransactionInfo: "current.receipt.signature", status: Status.ACTIVE,
  }] }] });
});
describe("Apple server verification boundaries", () => {
  it("rejects account mismatch before calling Apple or writing access", async () => {
    await expect(synchronizePurchase("claim.receipt.signature", "00000000-0000-4000-8000-000000000002")).rejects.toThrow("another");
    expect(mock.statuses).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("uses current Apple status to deny a replayed receipt after refund", async () => {
    mock.statuses.mockResolvedValue({ data: [{ lastTransactions: [{ originalTransactionId: "original", signedTransactionInfo: "current.receipt.signature", status: Status.REVOKED }] }] });
    await synchronizePurchase("claim.receipt.signature", userId);
    expect(mock.transaction).toHaveBeenCalledWith("current.receipt.signature", "Production");
    expect(mock.rpc).toHaveBeenCalledWith("sync_apple_subscription", expect.objectContaining({ p_user_id: userId, p_revoked: true, p_access_until: new Date(0).toISOString() }));
  });
  it("fails safely when Apple has not returned the original subscription", async () => {
    mock.statuses.mockResolvedValue({ data: [] });
    await expect(synchronizePurchase("claim.receipt.signature", userId)).rejects.toThrow("not returned");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects a mismatch in the current server transaction account", async () => {
    mock.transaction.mockResolvedValueOnce(transaction).mockResolvedValueOnce({ ...transaction, appAccountToken: "00000000-0000-4000-8000-000000000002" });
    await expect(synchronizePurchase("claim.receipt.signature", userId)).rejects.toThrow("does not match");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("retries Sandbox for verified identity or environment mismatches, never invalid signatures", async () => {
    mock.transaction.mockRejectedValueOnce(new VerificationException(VerificationStatus.INVALID_ENVIRONMENT)).mockResolvedValueOnce({ ...transaction, environment: Environment.SANDBOX });
    await verifyTransaction("claim.receipt.signature");
    expect(mock.environments).toEqual(["Production", "Sandbox"]);
    mock.environments.length = 0;
    mock.transaction.mockRejectedValueOnce(new VerificationException(VerificationStatus.INVALID_APP_IDENTIFIER)).mockResolvedValueOnce({ ...transaction, environment: Environment.SANDBOX });
    await verifyTransaction("claim.receipt.signature");
    expect(mock.environments).toEqual(["Production", "Sandbox"]);
    mock.environments.length = 0;
    mock.transaction.mockRejectedValueOnce(new Error("Invalid signature"));
    await expect(verifyTransaction("claim.receipt.signature")).rejects.toThrow("Invalid signature");
    expect(mock.environments).toEqual(["Production"]);
  });
  it("requires server credentials before granting access", async () => {
    vi.stubEnv("APPLE_IAP_PRIVATE_KEY", "");
    await expect(synchronizePurchase("claim.receipt.signature", userId)).rejects.toThrow("temporarily unavailable");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("does not resurrect a deleted account on renewal", async () => {
    mock.notification.mockResolvedValue({ data: { environment: "Production", signedTransactionInfo: "current.receipt.signature", status: Status.ACTIVE } });
    mock.user.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
    await processNotification("notification.payload.signature");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("uses notification signing time to order later refund events", async () => {
    mock.notification.mockResolvedValue({ signedDate: 1_950_000_000_000, data: { environment: "Production", signedTransactionInfo: "current.receipt.signature", status: Status.REVOKED } });
    await processNotification("notification.payload.signature");
    expect(mock.rpc).toHaveBeenCalledWith("sync_apple_subscription", expect.objectContaining({ p_revoked: true, p_signed_at: new Date(1_950_000_000_000).toISOString() }));
  });
  it("acknowledges a verified test notification without touching accounts", async () => {
    mock.notification.mockResolvedValue({ notificationType: "TEST" });
    await processNotification("notification.payload.signature");
    expect(mock.user).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
