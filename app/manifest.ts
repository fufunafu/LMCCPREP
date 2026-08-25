import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LMCC Prep",
    short_name: "LMCC Prep",
    description: "Focused question bank practice for the MCCQE Part I.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#07110e",
    theme_color: "#059669",
    orientation: "portrait-primary",
    categories: ["education", "medical"],
    shortcuts: [
      { name: "Dashboard", short_name: "Dashboard", url: "/dashboard", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "New practice session", short_name: "Practice", url: "/create", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
