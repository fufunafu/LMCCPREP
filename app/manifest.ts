import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Montreal QBank",
    short_name: "Montreal QBank",
    description: "Focused question bank practice for the current MCCQE.",
    start_url: "/login?next=/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#07110e",
    theme_color: "#059669",
    categories: ["education", "medical"],
    shortcuts: [
      { name: "Dashboard", short_name: "Dashboard", url: "/dashboard", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "New practice session", short_name: "Practice", url: "/create", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
