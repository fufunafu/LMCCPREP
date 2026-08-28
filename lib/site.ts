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
