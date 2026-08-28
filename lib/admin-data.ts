import "server-only";

import { requireAdmin } from "@/lib/admin";
import { isAdminEmail, roleFromAppMetadata, type UserRole } from "@/lib/admin-core";
import { billingPlans, hasCurrentEntitlement, planForPrice } from "@/lib/billing-core";
import type { BillingSubscriptionStatus } from "@/lib/types";

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  roleSource: "default" | "metadata" | "environment";
  createdAt: string;
  lastSignInAt: string | null;
  confirmed: boolean;
  access: "subscription" | "grant" | "none";
  plan: string | null;
  subscriptionStatus: BillingSubscriptionStatus | null;
  accessUntil: string | null;
  cancelAtPeriodEnd: boolean;
  grantReason: string | null;
  grantExpiresAt: string | null;
  stripeCustomerId: string | null;
};

type SubscriptionRow = {
  user_id: string;
  stripe_customer_id: string;
  stripe_price_id: string;
  status: BillingSubscriptionStatus;
  access_until: string | null;
  cancel_at_period_end: boolean;
  latest_event_created_at: string | null;
};

async function listAllAuthUsers(admin: Awaited<ReturnType<typeof requireAdmin>>) {
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("Could not list accounts.");
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

function planLabel(priceId: string) {
  const key = planForPrice(priceId);
  return billingPlans().find((plan) => plan.key === key)?.name ?? key ?? null;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const admin = await requireAdmin();
  const [authUsers, profiles, subscriptions, grants, customers] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from("profiles").select("id,display_name"),
    admin.from("billing_subscriptions").select("user_id,stripe_customer_id,stripe_price_id,status,access_until,cancel_at_period_end,latest_event_created_at"),
    admin.from("billing_access_grants").select("user_id,reason,expires_at"),
    admin.from("billing_customers").select("user_id,stripe_customer_id"),
  ]);
  if (profiles.error || subscriptions.error || grants.error || customers.error) throw new Error("Could not load account billing state.");

  const names = new Map(profiles.data.map((row) => [row.id as string, row.display_name as string | null]));
  const grantByUser = new Map(grants.data.map((row) => [row.user_id as string, row]));
  const customerByUser = new Map(customers.data.map((row) => [row.user_id as string, row.stripe_customer_id as string]));
  // Keep the subscription with the latest access for each user.
  const subscriptionByUser = new Map<string, SubscriptionRow>();
  for (const row of subscriptions.data as SubscriptionRow[]) {
    const current = subscriptionByUser.get(row.user_id);
    if (!current || (row.access_until ?? "") > (current.access_until ?? "")) subscriptionByUser.set(row.user_id, row);
  }

  return authUsers
    .map((user) => {
      const subscription = subscriptionByUser.get(user.id);
      const grant = grantByUser.get(user.id);
      const subscribed = subscription ? hasCurrentEntitlement({ status: subscription.status, accessUntil: subscription.access_until ?? undefined }) : false;
      const granted = grant ? hasCurrentEntitlement({ granted: true, grantExpiresAt: grant.expires_at ?? undefined }) : false;
      const environmentAdmin = isAdminEmail(user.email, process.env.ADMIN_EMAILS);
      const metadataRole = roleFromAppMetadata(user.app_metadata);
      return {
        id: user.id,
        email: user.email ?? "",
        displayName: names.get(user.id) ?? null,
        role: environmentAdmin ? "admin" : metadataRole,
        roleSource: environmentAdmin ? "environment" : user.app_metadata?.role ? "metadata" : "default",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        confirmed: Boolean(user.email_confirmed_at),
        access: subscribed ? "subscription" : granted ? "grant" : "none",
        plan: subscription ? planLabel(subscription.stripe_price_id) : null,
        subscriptionStatus: subscription?.status ?? null,
        accessUntil: subscription?.access_until ?? null,
        cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
        grantReason: grant?.reason ?? null,
        grantExpiresAt: grant?.expires_at ?? null,
        stripeCustomerId: subscription?.stripe_customer_id ?? customerByUser.get(user.id) ?? null,
      } satisfies AdminUser;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type AdminOverview = {
  users: { total: number; last7Days: number; last30Days: number; unconfirmed: number };
  access: { subscribed: number; granted: number; none: number };
  subscriptions: Record<string, number>;
  mrrCad: number;
  planCounts: Array<{ plan: string; count: number }>;
  webhooks: { total: number; failed: number; lastReceivedAt: string | null; lastError: string | null };
  requests: { total: number; last30Days: number };
  questions: { total: number; approved: number };
  billing: { required: boolean; graceDays: number };
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const admin = await requireAdmin();
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000).toISOString();
  const [users, webhookTotal, webhookFailed, lastWebhook, lastFailure, requestsTotal, requestsRecent, questionsTotal, questionsApproved, settings] = await Promise.all([
    listAdminUsers(),
    admin.from("stripe_webhook_events").select("*", { count: "exact", head: true }),
    admin.from("stripe_webhook_events").select("*", { count: "exact", head: true }).not("processing_error", "is", null),
    admin.from("stripe_webhook_events").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("stripe_webhook_events").select("processing_error,event_type").not("processing_error", "is", null).order("received_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("access_requests").select("*", { count: "exact", head: true }),
    admin.from("access_requests").select("*", { count: "exact", head: true }).gte("created_at", days(30)),
    admin.from("questions").select("*", { count: "exact", head: true }),
    admin.from("questions").select("*", { count: "exact", head: true }).in("distribution_rights_status", ["original", "licensed", "verified"]),
    admin.from("billing_settings").select("billing_required,grace_days").eq("id", true).maybeSingle(),
  ]);

  const subscriptions: Record<string, number> = {};
  const planCounts = new Map<string, number>();
  let mrrCad = 0;
  const plans = billingPlans();
  for (const user of users) {
    if (user.subscriptionStatus) subscriptions[user.subscriptionStatus] = (subscriptions[user.subscriptionStatus] ?? 0) + 1;
    if (user.access === "subscription" && user.plan) {
      planCounts.set(user.plan, (planCounts.get(user.plan) ?? 0) + 1);
      const plan = plans.find((candidate) => candidate.name === user.plan);
      if (plan?.amountCad && plan.months) mrrCad += plan.amountCad / plan.months;
    }
  }
  return {
    users: {
      total: users.length,
      last7Days: users.filter((user) => user.createdAt >= days(7)).length,
      last30Days: users.filter((user) => user.createdAt >= days(30)).length,
      unconfirmed: users.filter((user) => !user.confirmed).length,
    },
    access: {
      subscribed: users.filter((user) => user.access === "subscription").length,
      granted: users.filter((user) => user.access === "grant").length,
      none: users.filter((user) => user.access === "none").length,
    },
    subscriptions,
    mrrCad: Math.round(mrrCad * 100) / 100,
    planCounts: [...planCounts].map(([plan, count]) => ({ plan, count })),
    webhooks: {
      total: webhookTotal.count ?? 0,
      failed: webhookFailed.count ?? 0,
      lastReceivedAt: (lastWebhook.data?.received_at as string | undefined) ?? null,
      lastError: lastFailure.data ? `${lastFailure.data.event_type}: ${lastFailure.data.processing_error}` : null,
    },
    requests: { total: requestsTotal.count ?? 0, last30Days: requestsRecent.count ?? 0 },
    questions: { total: questionsTotal.count ?? 0, approved: questionsApproved.count ?? 0 },
    billing: { required: Boolean(settings.data?.billing_required), graceDays: Number(settings.data?.grace_days ?? 3) },
  };
}

export type AdminQuestionFilters = { exam?: string; subject?: string; rights?: string; editorial?: string; q?: string; page?: number };
export type AdminQuestionRow = {
  qid: number;
  subjectId: string;
  topicId: string | null;
  stem: string;
  source: string;
  rights: string;
  editorial: string;
  tags: string[];
  createdAt: string | null;
};

const QUESTION_PAGE_SIZE = 50;

export async function listAdminQuestions(filters: AdminQuestionFilters) {
  const admin = await requireAdmin();
  const page = Math.max(1, filters.page ?? 1);
  let query = admin
    .from("questions")
    .select("qid,subject_id,topic_id,stem,source,distribution_rights_status,editorial_status,tags,created_at", { count: "exact" })
    .order("qid", { ascending: true })
    .range((page - 1) * QUESTION_PAGE_SIZE, page * QUESTION_PAGE_SIZE - 1);
  if (filters.subject) query = query.eq("subject_id", filters.subject);
  else if (filters.exam) query = filters.exam === "usmle" ? query.like("subject_id", "usmle-%") : query.not("subject_id", "like", "usmle-%");
  if (filters.rights) query = query.eq("distribution_rights_status", filters.rights);
  if (filters.editorial) query = query.eq("editorial_status", filters.editorial);
  if (filters.q?.trim()) {
    const term = filters.q.trim();
    query = /^\d+$/.test(term) ? query.eq("qid", Number(term)) : query.ilike("stem", `%${term.replaceAll("%", "")}%`);
  }
  const [{ data, error, count }, subjects, breakdown] = await Promise.all([
    query,
    admin.from("subjects").select("id,name,exam_id").order("sort"),
    admin.from("questions").select("subject_id,distribution_rights_status,editorial_status"),
  ]);
  if (error || subjects.error || breakdown.error) throw new Error("Could not load questions.");
  const perSubject = new Map<string, { total: number; approved: number }>();
  for (const row of breakdown.data) {
    const entry = perSubject.get(row.subject_id) ?? { total: 0, approved: 0 };
    entry.total += 1;
    if (["original", "licensed", "verified"].includes(row.distribution_rights_status)) entry.approved += 1;
    perSubject.set(row.subject_id, entry);
  }
  return {
    rows: data.map((row) => ({
      qid: row.qid,
      subjectId: row.subject_id,
      topicId: row.topic_id,
      stem: row.stem,
      source: row.source,
      rights: row.distribution_rights_status,
      editorial: row.editorial_status,
      tags: (row.tags as string[] | null) ?? [],
      createdAt: row.created_at,
    }) satisfies AdminQuestionRow),
    total: count ?? 0,
    page,
    pageSize: QUESTION_PAGE_SIZE,
    subjects: subjects.data.map((subject) => ({ id: subject.id as string, name: subject.name as string, examId: subject.exam_id as string, ...(perSubject.get(subject.id) ?? { total: 0, approved: 0 }) })),
  };
}

export async function getAdminQuestion(qid: number) {
  const admin = await requireAdmin();
  const { data, error } = await admin
    .from("questions")
    .select("qid,subject_id,topic_id,stem,options,answer_index,explanation,source,distribution_rights_status,distribution_rights_note,editorial_status,last_reviewed_at,reviewer_role,tags,needs_review,review_note,has_figure,created_at,content_author,license_or_permission")
    .eq("qid", qid)
    .maybeSingle();
  if (error) throw new Error("Could not load the question.");
  if (!data) return null;
  const [attempts, topic] = await Promise.all([
    admin.from("attempts").select("correct").eq("qid", qid),
    data.topic_id ? admin.from("topics").select("name").eq("id", data.topic_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const relevant = attempts.data ?? [];
  const correct = relevant.filter((attempt) => attempt.correct).length;
  return { ...data, topicName: (topic.data?.name as string | undefined) ?? null, attemptCount: relevant.length, correctCount: correct };
}

export async function listAccessRequests() {
  const admin = await requireAdmin();
  const { data, error } = await admin.from("access_requests").select("id,email,name,message,created_at").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("Could not load access requests.");
  return data as Array<{ id: string; email: string; name: string | null; message: string | null; created_at: string }>;
}
