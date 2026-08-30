export const DEFAULT_SITE_ORIGIN = "https://montrealqbank.vercel.app";

export function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_ORIGIN;
  try {
    const url = new URL(configured);
    return url.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export const publicRoutes = ["/", "/features", "/pricing", "/faq", "/coaching", "/request-access", "/terms", "/privacy", "/refund-policy", "/support"] as const;

/**
 * Public install link for the iOS app: a TestFlight public link while in
 * beta, the App Store URL once published. Rendered only when configured.
 */
export function iosAppUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_IOS_APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ["testflight.apple.com", "apps.apple.com"].includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}
