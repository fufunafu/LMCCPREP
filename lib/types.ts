export type Subject = { id: string; name: string; questionCount: number }
export type Topic   = { id: string; subjectId: string; name: string; questionCount: number }
export type Question = { id: string; qid: number; subjectId: string; topicId: string; stem: string;
                    options: string[]; answerIdx: number; explanation: string[]; figureUrl?: string }
export type QuestionSummary = Pick<Question, "id" | "qid" | "subjectId" | "topicId" | "stem"> & { optionCount: number }
export type SessionMode = 'tutor' | 'timed'
export type Session = { id: string; mode: SessionMode; questionIds: string[]; createdAt: string;
                   finishedAt?: string; secondsPerQuestion?: number; currentIndex?: number; attempted?: number; correct?: number; durationMs?: number }
export type Attempt = { questionId: string; sessionId: string; chosenIdx: number | null; correct: boolean;
                   timeMs: number; createdAt: string }
export type QuestionStatus = 'unused' | 'correct' | 'incorrect' | 'flagged'
export type SubjectStats = { subjectId: string; attempted: number; correct: number; avgTimeMs: number }
export type TopicStats   = { topicId: string;   attempted: number; correct: number; avgTimeMs: number }
export type DailyActivity = { date: string; attempted: number; correct: number }
export type DashboardStats = { totalQuestions: number; attempted: number; correct: number; streakDays: number;
                          subjects: SubjectStats[]; weakestTopics: TopicStats[]; activity: DailyActivity[] }
export type Profile = { id: string; name: string; email: string; streakDays: number; medicalSchool: string;
                    targetExamDate: string; dailyReminder: boolean; showShortcuts: boolean; explanationAutoScroll: boolean }
