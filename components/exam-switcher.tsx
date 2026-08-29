"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProfile } from "@/lib/actions";
import { cn } from "@/lib/utils";
import type { Exam } from "@/lib/types";

/**
 * Shows the exam the learner is studying for and switches it in place.
 * Subjects, sessions, and statistics are all scoped to the active exam.
 */
export function ExamSwitcher({ exams, currentExamId, compact = false, disabled = false }: { exams: Exam[]; currentExamId: string; compact?: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const active = optimistic ?? currentExamId;
  if (exams.length < 2) return null;
  const choose = (examId: string) => {
    if (examId === active || pending) return;
    setOptimistic(examId);
    start(async () => {
      try {
        await updateProfile({ examId });
        router.refresh();
      } catch {
        setOptimistic(null);
        toast.error("Could not switch exams. Try again.");
      }
    });
  };
  return (
    <div role="radiogroup" aria-label="Exam you are studying for" className={cn("inline-flex rounded-lg border bg-muted/40 p-0.5", compact ? "text-xs" : "text-sm")}>
      {exams.map((exam) => <button key={exam.id} type="button" role="radio" aria-checked={exam.id === active} disabled={disabled || pending} title={exam.name} onClick={() => choose(exam.id)} className={cn("rounded-md px-2.5 py-1 font-medium transition disabled:opacity-60", exam.id === active ? "bg-background text-emerald-800 shadow-sm dark:text-emerald-300" : "text-muted-foreground hover:text-foreground")}>{exam.shortName}</button>)}
    </div>
  );
}
