import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { isDemoSession } from "@/lib/demo-session";
import { requireEntitledUserId, SubscriptionRequiredError } from "@/lib/billing";
import * as mock from "@/lib/data-mock";
import * as supabase from "@/lib/data-supabase";
import type { Attempt, DashboardStats, Profile, Question, QuestionStatus, QuestionSummary, Session, Subject, Topic, TopicStats } from "@/lib/types";

async function accountSource() {
  return await isDemoSession() ? mock : supabase;
}

const paidSource = cache(async () => {
  if (await isDemoSession()) return mock;
  let accessError: unknown;
  try {
    await requireEntitledUserId();
  } catch (error) {
    accessError = error;
  }
  if (accessError instanceof SubscriptionRequiredError) redirect("/billing?notice=subscription-required");
  if (accessError) throw accessError;
  return supabase;
});

export async function getSubjects(): Promise<Subject[]> { return (await paidSource()).getSubjects(); }
export async function getPublicSubjects(): Promise<Subject[]> { return await isDemoSession() ? mock.getSubjects() : supabase.getPublicSubjects(); }
export async function getTopics(subjectId?: string): Promise<Topic[]> { return (await paidSource()).getTopics(subjectId); }
export async function getQuestions(): Promise<Question[]> { return (await paidSource()).getQuestions(); }
export async function getQuestionSummaries(): Promise<QuestionSummary[]> { return (await paidSource()).getQuestionSummaries(); }
export async function getQuestion(id: string): Promise<Question | undefined> { return (await paidSource()).getQuestion(id); }
export async function getQuestionsByIds(ids: string[]): Promise<Question[]> { return (await paidSource()).getQuestionsByIds(ids); }
export async function getQuestionStatuses(): Promise<Record<string, QuestionStatus>> { return (await paidSource()).getQuestionStatuses(); }
export async function getQuestionStatus(id: string): Promise<QuestionStatus> { return (await paidSource()).getQuestionStatus(id); }
export async function getFlaggedQuestions(): Promise<Question[]> { return (await paidSource()).getFlaggedQuestions(); }
export async function getFlaggedQuestionIds(questionIds?: string[]): Promise<string[]> { return (await paidSource()).getFlaggedQuestionIds(questionIds); }
export async function getNotes(questionIds?: string[]): Promise<Record<string, string>> { return (await paidSource()).getNotes(questionIds); }
export async function getSession(id: string): Promise<Session | undefined> { return (await paidSource()).getSession(id); }
export async function getSessionQuestions(id: string): Promise<Question[]> { return (await paidSource()).getSessionQuestions(id); }
export async function getSessionAttempts(id: string): Promise<Attempt[]> { return (await paidSource()).getSessionAttempts(id); }
export async function getRecentSessions(limit = 8): Promise<Session[]> { return (await paidSource()).getRecentSessions(limit); }
export async function getTopicStats(): Promise<TopicStats[]> { return (await paidSource()).getTopicStats(); }
export async function getDashboardStats(): Promise<DashboardStats> { return (await paidSource()).getDashboardStats(); }
export async function getUserId(): Promise<string | null> { return (await accountSource()).getUserId(); }
export async function getProfile(): Promise<Profile | null> { return (await accountSource()).getProfile(); }
