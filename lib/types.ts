export type Exam    = { id: string; name: string; shortName: string; secondsPerQuestion: number; sectionSize: number }
export type Subject = { id: string; name: string; questionCount: number; examId: string }
export type Topic   = { id: string; subjectId: string; name: string; questionCount: number }
export type EditorialStatus = "pending" | "reviewed" | "stale" | "personal"
export type Question = { id: string; qid: number; subjectId: string; topicId: string; stem: string;
                    options: string[]; answerIdx: number; explanation: string[]; tags?: string[]; figureUrl?: string; figureUrls?: string[];
                    references?: string[]; editorialStatus?: EditorialStatus; lastReviewedAt?: string; reviewerRole?: string; referenceException?: string; isPersonal?: boolean }
export type QuestionSummary = Pick<Question, "id" | "qid" | "subjectId" | "topicId" | "stem"> & { optionCount: number; tags: string[] }
export type SessionMode = 'tutor' | 'timed'
export type Session = { id: string; mode: SessionMode; questionIds: string[]; createdAt: string;
                   finishedAt?: string; secondsPerQuestion?: number; currentIndex?: number; attempted?: number; correct?: number; durationMs?: number }
export type BillingPlanKey = "monthly" | "quarterly" | "annual"
export type BillingSubscriptionStatus = "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused"
export type BillingPlan = { key: BillingPlanKey; name: string; cadence: string; months: number; priceId?: string; amountCad?: number; formattedPrice?: string; trialDays?: number; configured: boolean }
export type BillingSummary = {
  mode: "demo" | "disabled" | "enabled" | "configuration_error"
  configured: boolean
  required: boolean
  hasAccess: boolean
  subscriptionHasAccess: boolean
  customerId?: string
  subscriptionId?: string
  priceId?: string
  plan?: BillingPlanKey
  status?: BillingSubscriptionStatus
  currentPeriodEnd?: string
  accessUntil?: string
  trialEnd?: string
  paymentFailedAt?: string
  cancelAtPeriodEnd?: boolean
  granted?: boolean
  grantExpiresAt?: string
  error?: string
}
export type Attempt = { questionId: string; sessionId: string; chosenIdx: number | null; correct: boolean;
                   timeMs: number; createdAt: string }
export type QuestionStatus = 'unused' | 'correct' | 'incorrect' | 'flagged'
export type SubjectStats = { subjectId: string; attempted: number; correct: number; avgTimeMs: number }
export type TopicStats   = { topicId: string;   attempted: number; correct: number; avgTimeMs: number }
export type DailyActivity = { date: string; attempted: number; correct: number }
export type DashboardStats = { totalQuestions: number; attempted: number; correct: number; streakDays: number;
                          subjects: SubjectStats[]; weakestTopics: TopicStats[]; activity: DailyActivity[] }
export type Profile = { id: string; name: string; email: string; streakDays: number; medicalSchool: string;
                    targetExamDate: string; dailyReminder: boolean; showShortcuts: boolean; explanationAutoScroll: boolean; examId: string }
