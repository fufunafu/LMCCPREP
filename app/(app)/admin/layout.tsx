import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader } from "@/components/page-header";
import { isAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Non-admins get a 404 so the panel's existence is not advertised.
  if (!(await isAdmin())) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageHeader eyebrow="Administration" title="Admin panel" description="Accounts, subscriptions, the question bank, and billing controls." />
      <AdminNav />
      {children}
    </div>
  );
}
