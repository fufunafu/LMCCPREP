import { AuthHashRedirect } from "@/components/auth-hash-redirect";
import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://lmcc-prep.vercel.app"),
  title: {
    default: "LMCC Prep | Master the MCCQE Part I",
    template: "%s | LMCC Prep",
  },
  description: "Focused question bank practice for Canadian medical students preparing for the MCCQE Part I.",
  robots: { index: true, follow: true },
  applicationName: "LMCC Prep",
  appleWebApp: { capable: true, title: "LMCC Prep", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    title: "LMCC Prep | Master the MCCQE Part I",
    description: "Practice with purpose. Walk in prepared for the MCCQE Part I.",
    siteName: "LMCC Prep",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "LMCC Prep question bank" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LMCC Prep | Master the MCCQE Part I",
    description: "Practice with purpose. Walk in prepared for the MCCQE Part I.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#07110e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <ServiceWorkerRegistration />
          <TooltipProvider><AuthHashRedirect />{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
