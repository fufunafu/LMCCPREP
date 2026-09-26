/** Stable IDs shared with StoreKit and App Store Connect. Prices come from Apple. */
export const APPLE_BUNDLE_ID = "ca.lmccprep.app";
export const APPLE_APP_ID = 6805178274;
export const APPLE_GROUP_ID = "22392387";
export const appleProducts = Object.fromEntries(
  (["mccqe"] as const).flatMap((examId) =>
    (["monthly", "quarterly", "annual"] as const).map((period) => [
      `ca.lmccprep.app.${examId}.${period}`, { examId, period },
    ])),
) as Record<string, { examId: "mccqe" | "usmle"; period: string }>;
