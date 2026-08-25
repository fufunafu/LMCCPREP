export function safeReturnPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

export function configuredSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
    ?? process.env.VERCEL_URL;
  if (!configured) return null;
  try {
    return new URL(configured.startsWith("http://") || configured.startsWith("https://") ? configured : `https://${configured}`).origin;
  } catch {
    return null;
  }
}
