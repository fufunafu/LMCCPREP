"use server";

import { createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE, DEMO_COOKIE_VALUE, DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-auth";
import { isDemoSession } from "@/lib/demo-session";
import type { QuestionStatus, SessionMode } from "@/lib/types";
import { configuredSiteOrigin, safeReturnPath } from "@/lib/urls";
import { DEFAULT_SECONDS_PER_QUESTION } from "@/lib/utils";
import { requireEntitledUserId } from "@/lib/billing";
import { billingConfigured } from "@/lib/billing-core";
import { createAdminClient } from "@/lib/supabase/admin";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function requireUserId(supabase: ServerSupabaseClient) {
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId) throw new Error("Your session has expired. Sign in again to continue.");
  return userId;
}

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (normalized.includes("rate limit") || normalized.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (normalized.includes("email not confirmed")) return "Confirm your email before signing in.";
  if (normalized.includes("network") || normalized.includes("fetch")) return "We could not reach the sign-in service. Check your connection and try again.";
  return "We could not sign you in. Try again or reset your password.";
}

function applicationOrigin() {
  // Only configured origins are trusted for auth links: NEXT_PUBLIC_SITE_URL, then
  // VERCEL_PROJECT_PRODUCTION_URL, then VERCEL_URL. Request headers are never used.
  const configured = configuredSiteOrigin();
  if (!configured) throw new Error("NEXT_PUBLIC_SITE_URL is not configured; password reset links cannot be generated.");
  return configured;
}

async function enterDemo(next: string) {
  (await cookies()).set(DEMO_COOKIE, DEMO_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect(safeReturnPath(next));
}

// ---------- auth ----------
export async function startDemoSession(next = "/dashboard") {
  await enterDemo(next);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  if (email.toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
    await enterDemo(next);
  }
  const supabase = await createClient();
  let message: string | null = null;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) message = authErrorMessage(error.message);
  } catch {
    message = "We could not reach the sign-in service. Check your connection and try again.";
  }
  if (message) redirect(`/login?error=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}`);
  redirect(safeReturnPath(next));
}

/**
 * Self-serve account creation. Only offered once a Stripe Checkout integration
 * is configured, since the account exists to hold a subscription. Supabase
 * sends a confirmation email; the callback then continues to `next`.
 */
export async function signUp(formData: FormData) {
  if (await isDemoSession()) redirect("/dashboard");
  if (!billingConfigured()) redirect("/login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const next = safeReturnPath(String(formData.get("next") ?? ""), "/billing");
  const examId = String(formData.get("examId") ?? "mccqe");
  const back = (message: string) => redirect(`/signup?error=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  if (!/^[a-z0-9-]{2,32}$/.test(examId)) back("Choose a valid exam.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("Enter a valid email address.");
  if (password.length < 10) back("Use a password of at least 10 characters.");
  if (password !== confirm) back("The passwords do not match.");
  const supabase = await createClient();
  const emailRedirectTo = `${applicationOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;
  let session = false;
  let message: string | null = null;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: { exam_id: examId } } });
    if (error) {
      const normalized = error.message.toLowerCase();
      message = normalized.includes("already registered") || normalized.includes("already exists")
        ? "An account with that email already exists. Sign in instead."
        : normalized.includes("signups not allowed") || normalized.includes("disabled")
          ? "Account creation is not open yet. Request an invitation instead."
          : normalized.includes("password")
            ? "Choose a stronger password."
            : authErrorMessage(error.message);
    } else {
      session = Boolean(data.session);
    }
  } catch {
    message = "We could not reach the sign-up service. Check your connection and try again.";
  }
  if (message) back(message);
  if (session) redirect(next);
  redirect(`/signup?notice=confirm&email=${encodeURIComponent(email)}`);
}

/**
 * Google OAuth via Supabase (PKCE). The provider redirects back to Supabase,
 * which then sends the browser to our /auth/callback with a code to exchange.
 */
export async function signInWithGoogle(formData: FormData) {
  if (await isDemoSession()) redirect("/dashboard");
  const next = safeReturnPath(String(formData.get("next") ?? ""), "/dashboard");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${applicationOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: "offline", prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent("Google sign-in is not available right now.")}`);
  redirect(data.url);
}

export async function signOut() {
  if (await isDemoSession()) {
    (await cookies()).delete(DEMO_COOKIE);
    return { redirectTo: "/login?notice=signed-out" } as const;
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Could not sign you out. Check your connection and try again.");
  return { redirectTo: "/login?notice=signed-out" } as const;
}

export async function requestPasswordReset(formData: FormData) {
  if (await isDemoSession()) redirect("/dashboard");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/forgot-password?error=Enter+your+email+address.");
  const supabase = await createClient();
  const redirectTo = `${applicationOrigin()}/auth/callback?next=${encodeURIComponent("/auth/set-password")}`;
  let message: string | null = null;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) message = authErrorMessage(error.message);
  } catch {
    message = "We could not reach the password service. Check your connection and try again.";
  }
  if (message) redirect(`/forgot-password?error=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}`);
  redirect("/login?notice=reset-sent");
}

export async function setPassword(formData: FormData) {
  if (await isDemoSession()) redirect("/dashboard");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect(`/auth/set-password?error=${encodeURIComponent("Use at least 8 characters.")}`);
  if (password !== String(formData.get("confirm") ?? "")) redirect(`/auth/set-password?error=${encodeURIComponent("Passwords do not match.")}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/auth/set-password?error=${encodeURIComponent("Could not update your password. Request a new reset link and try again.")}`);
  redirect("/dashboard");
}

export async function requestAccess(formData: FormData) {
  if (await isDemoSession()) return { demo: true };
  // A visually hidden honeypot lets ordinary visitors through and silently drops bots.
  if (String(formData.get("website") ?? "").trim()) return { demo: false };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (name.length > 120 || message.length > 2000) throw new Error("The request is too long.");
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || `email:${email}`;
  const fingerprintKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!fingerprintKey) throw new Error("Access requests are temporarily unavailable.");
  const requestFingerprint = createHmac("sha256", fingerprintKey).update(address).digest("hex");
  const now = new Date();
  const requestWindow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())).toISOString();
  const { error } = await createAdminClient().from("access_requests").insert({
    email,
    name: name || null,
    message: message || null,
    request_fingerprint: requestFingerprint,
    request_window: requestWindow,
  });
  // Duplicate email and one-request-per-address-per-hour limits are intentionally
  // indistinguishable from success, which prevents account and throttling probes.
  if (error && error.code !== "23505") throw new Error("Could not submit the access request.");
  return { demo: false };
}

export async function updateProfile(input: { displayName?: string; medicalSchool?: string; targetExamDate?: string | null; dailyReminder?: boolean; showShortcuts?: boolean; explanationAutoScroll?: boolean; examId?: string }) {
  if (await isDemoSession()) return { demo: true };
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const updates: Record<string, string | boolean | null> = {};
  if (input.displayName !== undefined) updates.display_name = input.displayName.trim() || null;
  if (input.medicalSchool !== undefined) updates.medical_school = input.medicalSchool.trim() || null;
  if (input.targetExamDate !== undefined) updates.target_exam_date = input.targetExamDate || null;
  if (input.dailyReminder !== undefined) updates.daily_reminder = input.dailyReminder;
  if (input.showShortcuts !== undefined) updates.show_shortcuts = input.showShortcuts;
  if (input.explanationAutoScroll !== undefined) updates.explanation_auto_scroll = input.explanationAutoScroll;
  if (input.examId !== undefined) {
    if (!/^[a-z0-9-]{2,32}$/.test(input.examId)) throw new Error("Choose a valid exam.");
    updates.exam_id = input.examId;
  }
  const { error } = await supabase.from("profiles").upsert({ id: userId, ...updates }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return { demo: false };
}

export async function resetProgress() {
  if (await isDemoSession()) return { demo: true };
  const supabase = await createClient();
  await requireUserId(supabase);
  const { error } = await supabase.rpc("reset_my_progress");
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/stats");
  revalidatePath("/questions");
  return { demo: false };
}

// ---------- sessions ----------
export async function createSession(input: {
  mode: SessionMode; subjectIds: string[]; topicIds: string[]; status: QuestionStatus | "all"; count: number; secondsPerQuestion?: number;
}) {
  if (await isDemoSession()) return { redirectTo: `/session/demo?mode=${input.mode}` } as const;
  if (!(["tutor", "timed"] as const).includes(input.mode)) throw new Error("Choose a valid session mode.");
  if (!(["unused", "correct", "incorrect", "flagged", "all"] as const).includes(input.status)) throw new Error("Choose a valid question status.");
  if (!Number.isFinite(input.count)) throw new Error("Choose a valid number of questions.");
  if (!Array.isArray(input.subjectIds) || !Array.isArray(input.topicIds) || [...input.subjectIds, ...input.topicIds].some((id) => typeof id !== "string")) throw new Error("Choose valid subjects and topics.");
  const supabase = await createClient();
  const userId = await requireEntitledUserId(supabase);
  const { data: qids, error } = await supabase.rpc("pick_questions", {
    p_subjects: input.subjectIds.length ? input.subjectIds : null,
    p_topics: input.topicIds.length ? input.topicIds : null,
    p_status: input.status,
    p_limit: Math.max(1, Math.min(115, input.count)),
  });
  if (error) throw new Error(error.message);
  if (!qids?.length) return { error: "No questions match those filters." } as const;
  const { data: session, error: sErr } = await supabase.from("sessions").insert({
    user_id: userId, mode: input.mode, question_ids: qids,
    seconds_per_question: input.mode === "timed" ? Math.max(15, Math.min(600, input.secondsPerQuestion ?? DEFAULT_SECONDS_PER_QUESTION)) : null,
    filters: { subjectIds: input.subjectIds, topicIds: input.topicIds, status: input.status },
  }).select("id").single();
  if (sErr) throw new Error(sErr.message);
  return { redirectTo: `/session/${session.id}` } as const;
}

export async function recordAttempt(input: { sessionId: string; qid: number; chosenIdx: number | null; timeMs: number }) {
  if (await isDemoSession()) return;
  if (typeof input.sessionId !== "string" || !input.sessionId) throw new Error("This question is not part of the session.");
  if (!Number.isInteger(input.qid)) throw new Error("This question is no longer available.");
  if (!Number.isFinite(input.timeMs)) throw new Error("Choose a valid answer.");
  const supabase = await createClient();
  const userId = await requireEntitledUserId(supabase);
  const [{ data: session, error: sessionError }, { data: question, error: questionError }] = await Promise.all([
    supabase.from("sessions").select("question_ids").eq("id", input.sessionId).maybeSingle(),
    supabase.from("questions").select("answer_index,options").eq("qid", input.qid).maybeSingle(),
  ]);
  if (sessionError || !session || !session.question_ids.includes(input.qid)) throw new Error(sessionError?.message ?? "This question is not part of the session.");
  if (questionError || !question) throw new Error(questionError?.message ?? "This question is no longer available.");
  if (input.chosenIdx !== null && (!Number.isInteger(input.chosenIdx) || input.chosenIdx < 0 || input.chosenIdx >= question.options.length)) throw new Error("Choose a valid answer.");
  const correct = input.chosenIdx === question.answer_index;
  const { error } = await supabase.from("attempts").insert({
    user_id: userId, session_id: input.sessionId, qid: input.qid,
    chosen_index: input.chosenIdx, correct, time_ms: Math.max(0, Math.min(86_400_000, Math.round(input.timeMs))),
  });
  if (error) throw new Error(error.message);
}

export async function setSessionProgress(sessionId: string, currentIndex: number) {
  if (await isDemoSession()) return;
  if (!Number.isInteger(currentIndex) || currentIndex < 0) throw new Error("Choose a valid question position.");
  const supabase = await createClient();
  await requireEntitledUserId(supabase);
  const { data: session, error: sessionError } = await supabase.from("sessions").select("question_ids").eq("id", sessionId).maybeSingle();
  if (sessionError || !session) throw new Error(sessionError?.message ?? "This session is no longer available.");
  const clamped = Math.min(currentIndex, Math.max(0, session.question_ids.length - 1));
  const { error } = await supabase.from("sessions").update({ current_index: clamped }).eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function finishSession(sessionId: string) {
  if (await isDemoSession()) return;
  const supabase = await createClient();
  await requireEntitledUserId(supabase);
  const { error } = await supabase.from("sessions").update({ finished_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/stats");
}

// ---------- flags & notes ----------
export async function toggleFlag(qid: number, flagged: boolean) {
  if (await isDemoSession()) return;
  const supabase = await createClient();
  const userId = await requireEntitledUserId(supabase);
  const { error } = flagged
    ? await supabase.from("flags").upsert({ user_id: userId, qid })
    : await supabase.from("flags").delete().eq("qid", qid);
  if (error) throw new Error(error.message);
}

export async function saveNote(qid: number, body: string) {
  if (await isDemoSession()) return;
  if (body.trim().length > 5000) throw new Error("Keep notes under 5,000 characters.");
  const supabase = await createClient();
  const userId = await requireEntitledUserId(supabase);
  const { error } = body.trim()
    ? await supabase.from("notes").upsert({ user_id: userId, qid, body: body.trim(), updated_at: new Date().toISOString() })
    : await supabase.from("notes").delete().eq("qid", qid);
  if (error) throw new Error(error.message);
}

export async function reportTypo(qid: number, field: string, suggestion: string) {
  if (await isDemoSession()) return;
  if (!suggestion.trim() || suggestion.trim().length > 2000) throw new Error("Enter a report under 2,000 characters.");
  const supabase = await createClient();
  const userId = await requireEntitledUserId(supabase);
  const { error } = await supabase.from("question_edits").insert({ user_id: userId, qid, field, suggestion: suggestion.trim() });
  if (error) throw new Error(error.message);
}

// ---------- authoring ----------
export async function addUserQuestion(input: { subjectId: string; topicName: string; stem: string; options: string[]; answerIdx: number; explanation: string[]; tags?: string[] }) {
  if (await isDemoSession()) return 9999;
  const topicName = input.topicName.trim();
  const stem = input.stem.trim();
  const options = input.options.map((option) => option.trim());
  const explanation = input.explanation.map((paragraph) => paragraph.trim()).filter(Boolean);
  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  if (!input.subjectId || !topicName || !stem || options.length < 2 || options.length > 6 || options.some((option) => !option) || !explanation.length) throw new Error("Complete every required question field.");
  if (!Number.isInteger(input.answerIdx) || input.answerIdx < 0 || input.answerIdx >= options.length) throw new Error("Choose a valid correct answer.");
  if (tags.length > 12 || tags.some((tag) => tag.length > 80)) throw new Error("Use at most 12 tags, with no tag longer than 80 characters.");
  const supabase = await createClient();
  await requireEntitledUserId(supabase);
  const { data, error } = await supabase.rpc("add_user_question", {
    p_subject_id: input.subjectId, p_topic_name: topicName, p_stem: stem,
    p_options: options, p_answer_index: input.answerIdx, p_explanation: explanation, p_tags: tags,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/questions");
  return data as number;
}
