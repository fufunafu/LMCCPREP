import { dashboardStats, demoAttempts, demoSession, questionStatuses, questions, recentSessions, subjects, topicStats, topics } from "@/lib/mock";

export function getSubjects() { return subjects; }
export function getTopics(subjectId?: string) { return subjectId ? topics.filter((topic) => topic.subjectId === subjectId) : topics; }
export function getQuestions() { return questions; }
export function getQuestionSummaries() { return questions.map(({ id, qid, subjectId, topicId, stem, options }) => ({ id, qid, subjectId, topicId, stem, optionCount: options.length })); }
export function getQuestion(id: string) { return questions.find((question) => question.id === id || String(question.qid) === id) ?? questions[0]; }
export function getQuestionsByIds(ids: string[]) { return ids.map((id) => getQuestion(id)); }
export function getQuestionStatus(id: string) { return questionStatuses[id] ?? "unused"; }
export function getQuestionStatuses() { return questionStatuses; }
export function getDashboardStats() { return dashboardStats; }
export function getSession(id: string) { return id === "demo" ? demoSession : recentSessions.find((session) => session.id === id) ?? demoSession; }
export function getSessionQuestions(id: string) { const session = getSession(id); return session.questionIds.map((questionId) => getQuestion(questionId)); }
export function getSessionAttempts(id: string) { return id === "demo" ? demoAttempts : demoAttempts.map((attempt) => ({ ...attempt, sessionId: id })); }
export function getRecentSessions(limit = 8) { return recentSessions.slice(0, limit); }
export function getTopicStats() { return topicStats; }
export function getFlaggedQuestions() { return questions.filter((question) => questionStatuses[question.id] === "flagged"); }
export function getFlaggedQuestionIds(questionIds?: string[]) { const ids = getFlaggedQuestions().map((question) => question.id); return questionIds ? ids.filter((id) => questionIds.includes(id)) : ids; }
export function getNotes(questionIds?: string[]) { const notes = { q2: "Review the Ottawa ankle rules and their exclusions." }; return questionIds ? Object.fromEntries(Object.entries(notes).filter(([id]) => questionIds.includes(id))) : notes; }
export function getUserId() { return "demo-user"; }
export function getProfile() { return { id: "demo-user", name: "Demo Learner", email: "demo@lmccprep.ca", streakDays: dashboardStats.streakDays, medicalSchool: "University of Toronto", targetExamDate: "2027-04-15", dailyReminder: true, showShortcuts: true, explanationAutoScroll: false }; }
