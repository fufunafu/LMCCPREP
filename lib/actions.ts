"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE, DEMO_COOKIE_VALUE, DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-auth";
import { isDemoSession } from "@/lib/demo-session";
import type { QuestionStatus, SessionMode } from "@/lib/types";
import { configuredSiteOrigin, safeReturnPath } from "@/lib/urls";
import { requireEntitledUserId } from "@/lib/billing";

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

async function applicationOrigin() {
  const configured = configuredSiteOrigin();
  if (configured) return configured;
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"))?.split(",")[0].trim();
  try {
    const parsed = origin ? new URL(origin) : null;
    if (parsed && parsed.host === host) return parsed.origin;
  } catch {
    // Continue to the trusted production fallback.
  }
  if (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")) return `http://${host}`;
  return "https://lmcc-prep.vercel.app";
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

export async function signOut() {
  if (await isDemoSession()) {
    (await cookies()).delete(DEMO_COOKIE);
    redirect("/login?notice=signed-out");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?notice=signed-out");
}

export async function requestPasswordReset(formData: FormData) {
  if (await isDemoSession()) redirect("/dashboard");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/forgot-password?error=Enter+your+email+address.");
  const supabase = await createClient();
  const redirectTo = `${await applicationOrigin()}/auth/callback?next=${encodeURIComponent("/auth/set-password")}`;
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (name.length > 120 || message.length > 2000) throw new Error("The request is too long.");
  const supabase = await createClient();
  const { error } = await supabase.from("access_requests").insert({
    email,
    name: name || null,
    message: message || null,
  });
  if (error) throw new Error(error.message);
  return { demo: false };
}

export async function updateProfile(input: { displayName?: string; medicalSchool?: string; targetExamDate?: string | null; dailyReminder?: boolean; showShortcuts?: boolean; explanationAutoScroll?: boolean }) {
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
  if (await isDemoSession()) redirect(`/session/demo?mode=${input.mode}`);
  if (!(["tutor", "timed"] as const).includes(input.mode)) throw new Error("Choose a valid session mode.");
  if (!(["unused", "correct", "incorrect", "flagged", "all"] as const).includes(input.status)) throw new Error("Choose a valid question status.");
  const supabase = await createClient();
  const userId = await requireEntitledUserId(supabase);
  const { data: qids, error } = await supabase.rpc("pick_questions", {
    p_subjects: input.subjectIds.length ? input.subjectIds : null,
    p_topics: input.topicIds.length ? input.topicIds : null,
    p_status: input.status,
    p_limit: Math.max(1, Math.min(200, input.count)),
  });
  if (error) throw new Error(error.message);
  if (!qids?.length) return { error: "No questions match those filters." } as const;
  const { data: session, error: sErr } = await supabase.from("sessions").insert({
    user_id: userId, mode: input.mode, question_ids: qids,
    seconds_per_question: input.mode === "timed" ? Math.max(15, Math.min(600, input.secondsPerQuestion ?? 75)) : null,
    filters: { subjectIds: input.subjectIds, topicIds: input.topicIds, status: input.status },
  }).select("id").single();
  if (sErr) throw new Error(sErr.message);
  redirect(`/session/${session.id}`);
}

export async function recordAttempt(input: { sessionId: string; qid: number; chosenIdx: number | null; timeMs: number }) {
  if (await isDemoSession()) return;
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
  const supabase = await createClient();
  await requireEntitledUserId(supabase);
  const { error } = await supabase.from("sessions").update({ current_index: currentIndex }).eq("id", sessionId);
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
