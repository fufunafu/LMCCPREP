import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/terms", "/privacy", "/refund-policy", "/support"],
      disallow: ["/api/", "/auth/", "/billing", "/create", "/dashboard", "/forgot-password", "/login", "/questions", "/session/", "/settings", "/stats", "/author"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
