import { AuthHashRedirect } from "@/components/auth-hash-redirect";
import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";
import { siteOrigin } from "@/lib/site";

const origin = siteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: {
    default: "Montreal QBank | MCCQE and USMLE Practice",
    template: "%s | Montreal QBank",
  },
  description: "Focused question bank practice for medical students and graduates preparing for the MCCQE Part I or the USMLE.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  applicationName: "Montreal QBank",
  appleWebApp: { capable: true, title: "Montreal QBank", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    title: "Montreal QBank | MCCQE and USMLE Practice",
    description: "Practice with purpose for the MCCQE Part I or the USMLE.",
    url: origin,
    siteName: "Montreal QBank",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Montreal QBank question bank" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Montreal QBank | MCCQE and USMLE Practice",
    description: "Practice with purpose for the MCCQE Part I or the USMLE.",
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
        <a href="#main-content" className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 dark:bg-white dark:text-slate-950">Skip to main content</a>
        <ThemeProvider>
          <ServiceWorkerRegistration />
          <TooltipProvider><AuthHashRedirect />{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
