"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { updateProfile } from "@/lib/actions";
import { buildStudyPlan, validateExamDate, type ExamDatePrecision } from "@/lib/study-plan";
import type { Profile } from "@/lib/types";
import { torontoDateKey } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StudyPlanCard({ profile, remainingQuestions }: { profile?: Profile; remainingQuestions?: number }) {
  const router = useRouter();
  const initialPrecision = profile?.examDatePrecision ?? (profile?.targetExamDate ? "exact" : null);
  const [saved, setSaved] = useState({ precision: initialPrecision, date: profile?.targetExamDate ?? "" });
  const [editing, setEditing] = useState(!initialPrecision);
  const [precision, setPrecision] = useState<ExamDatePrecision>(initialPrecision ?? "exact");
  const [date, setDate] = useState(profile?.targetExamDate ?? "");
  const [error, setError] = useState("");
  const [pending, startSaving] = useTransition();
  const [demoSaved, setDemoSaved] = useState(false);
  const today = torontoDateKey();
  const plan = buildStudyPlan(saved.date, remainingQuestions ?? 0, today);
  const formattedDate = saved.date ? new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${saved.date}T12:00:00Z`)) : "";

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submittedDate = String(form.get("exam-date") ?? "");
    setError("");
    startSaving(async () => {
      try {
        const choice = validateExamDate(precision, submittedDate, today);
        const result = await updateProfile({ targetExamDate: choice.date, examDatePrecision: choice.precision });
        setSaved({ precision: choice.precision, date: choice.date ?? "" });
        setDate(choice.date ?? "");
        setEditing(false);
        setDemoSaved(result.demo);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save your exam date. Try again.");
      }
    });
  }

  return (
    <Card className="mb-5 border-emerald-200 dark:border-emerald-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="size-5 text-emerald-700 dark:text-emerald-400" />{editing ? "When is your exam?" : "Your study plan"}</CardTitle>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={save} className="space-y-4">
            <p className="text-sm text-muted-foreground">We’ll use your timeline to suggest a daily pace and leave time for review. You can change this anytime.</p>
            <fieldset disabled={pending} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
              <legend className="sr-only">How certain is your exam date?</legend>
              {([{ value: "exact", label: "I know my date" }, { value: "approximate", label: "I have an approximate date" }, { value: "unknown", label: "I don’t know yet" }] as const).map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="exam-date-precision" value={option.value} checked={precision === option.value} onChange={() => { setPrecision(option.value); setError(""); }} className="size-4 accent-emerald-700" />{option.label}</label>
              ))}
            </fieldset>
            {precision !== "unknown" ? <div className="max-w-xs space-y-2"><Label htmlFor="study-exam-date">{precision === "approximate" ? "Approximate exam date" : "Exam date"}</Label><Input id="study-exam-date" name="exam-date" type="date" required min={today} value={date} onChange={(event) => setDate(event.target.value)} disabled={pending} />{precision === "approximate" && <p className="text-xs text-muted-foreground">Your best estimate is enough. You can adjust your target later.</p>}</div> : <p className="text-sm text-muted-foreground">Start with a flexible routine. Add a date whenever you’re ready.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : precision === "unknown" ? "Continue without a date" : "Save and build my plan"}</Button>{saved.precision && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setPrecision(saved.precision!); setDate(saved.date); setError(""); setEditing(false); }}>Cancel</Button>}</div>
          </form>
        ) : (
          <div className="space-y-3" role="status">
            <p className="text-sm font-medium">{saved.precision === "unknown" ? "Flexible schedule" : `${saved.precision === "approximate" ? "Aiming for around" : "Exam date:"} ${formattedDate}`}</p>
            {plan.kind === "past" ? <p className="text-sm text-muted-foreground">Your target date has passed. Update it when you’re ready to plan your next steps.</p> : plan.kind === "today" ? <p className="text-sm text-muted-foreground">Your target date is today. Keep any final review light and give yourself time to rest.</p> : remainingQuestions !== undefined ? remainingQuestions === 0 ? <p className="text-sm text-muted-foreground">No new questions remain in your available bank. Review missed and flagged questions to keep practicing.</p> : <>
              <p className="text-2xl font-semibold tracking-tight">{plan.questionsPerDay.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">new {plan.questionsPerDay === 1 ? "question" : "questions"} / day</span></p>
              <p className="text-sm text-muted-foreground">{plan.kind === "scheduled" ? `${remainingQuestions.toLocaleString()} questions remaining across ${plan.days} days.${plan.reviewDays ? ` The final ${plan.reviewDays} days are reserved for reviewing missed and flagged questions.` : " Include a short review of missed questions each day."}${saved.precision === "approximate" ? " This pace is based on your estimated date." : ""}` : "A suggested starting pace, with a short review of missed questions after each session. Add a date to work toward a deadline."}</p>
              {plan.kind === "scheduled" && plan.questionsPerDay > 100 && <p className="text-sm text-muted-foreground">This is a demanding pace. Prioritize weaker topics if a full pass through the bank is too much for your timeline.</p>}
            </> : <p className="text-sm text-muted-foreground">Your dashboard uses this timeline and your remaining questions to suggest a daily pace.</p>}
            <div className="flex flex-wrap gap-2">{remainingQuestions !== undefined && <Link href="/create" className={buttonVariants({ size: "sm" })}>Start a session</Link>}<Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>Update exam date</Button></div>
            {demoSaved && <p className="text-xs text-muted-foreground">Demo preview only. Your date is not saved to an account.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
