import "server-only";

import { isDemoSession } from "@/lib/demo-session";
import * as mock from "@/lib/data-mock";
import * as supabase from "@/lib/data-supabase";
import type { Attempt, DashboardStats, Profile, Question, QuestionStatus, QuestionSummary, Session, Subject, Topic, TopicStats } from "@/lib/types";

async function source() {
  return await isDemoSession() ? mock : supabase;
}

export async function getSubjects(): Promise<Subject[]> { return (await source()).getSubjects(); }
export async function getPublicSubjects(): Promise<Subject[]> { return await isDemoSession() ? mock.getSubjects() : supabase.getPublicSubjects(); }
export async function getTopics(subjectId?: string): Promise<Topic[]> { return (await source()).getTopics(subjectId); }
export async function getQuestions(): Promise<Question[]> { return (await source()).getQuestions(); }
export async function getQuestionSummaries(): Promise<QuestionSummary[]> { return (await source()).getQuestionSummaries(); }
export async function getQuestion(id: string): Promise<Question | undefined> { return (await source()).getQuestion(id); }
export async function getQuestionsByIds(ids: string[]): Promise<Question[]> { return (await source()).getQuestionsByIds(ids); }
export async function getQuestionStatuses(): Promise<Record<string, QuestionStatus>> { return (await source()).getQuestionStatuses(); }
export async function getQuestionStatus(id: string): Promise<QuestionStatus> { return (await source()).getQuestionStatus(id); }
export async function getFlaggedQuestions(): Promise<Question[]> { return (await source()).getFlaggedQuestions(); }
export async function getFlaggedQuestionIds(questionIds?: string[]): Promise<string[]> { return (await source()).getFlaggedQuestionIds(questionIds); }
export async function getNotes(questionIds?: string[]): Promise<Record<string, string>> { return (await source()).getNotes(questionIds); }
export async function getSession(id: string): Promise<Session | undefined> { return (await source()).getSession(id); }
export async function getSessionQuestions(id: string): Promise<Question[]> { return (await source()).getSessionQuestions(id); }
export async function getSessionAttempts(id: string): Promise<Attempt[]> { return (await source()).getSessionAttempts(id); }
export async function getRecentSessions(limit = 8): Promise<Session[]> { return (await source()).getRecentSessions(limit); }
export async function getTopicStats(): Promise<TopicStats[]> { return (await source()).getTopicStats(); }
export async function getDashboardStats(): Promise<DashboardStats> { return (await source()).getDashboardStats(); }
export async function getUserId(): Promise<string | null> { return (await source()).getUserId(); }
export async function getProfile(): Promise<Profile | null> { return (await source()).getProfile(); }
