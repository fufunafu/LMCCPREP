import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.BILLING_FIXTURE === "true" ? ".next-billing-fixture" : ".next",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      ...["/dashboard/:path*", "/create/:path*", "/questions/:path*", "/stats/:path*", "/settings/:path*", "/billing/:path*", "/session/:path*", "/author/:path*", "/auth/:path*", "/login", "/forgot-password"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      })),
    ];
  },
};

export default nextConfig;
