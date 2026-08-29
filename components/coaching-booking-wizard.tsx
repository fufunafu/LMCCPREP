"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, Lock } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createBooking } from "@/lib/coaching-actions";
import { formatCad, formatDay, formatTime, type CoachingExam, type CoachingService, type CoachingSlot, type CoachingTutor } from "@/lib/coaching-core";
import { CoachingSlotCalendar } from "@/components/coaching-slot-calendar";
import { cn } from "@/lib/utils";
import { useBrowserTimeZone } from "@/lib/use-browser-timezone";

const ANY_TUTOR = "any";

type Props = { services: CoachingService[]; exams: CoachingExam[]; tutors: CoachingTutor[]; slots: CoachingSlot[]; initialService?: string; error?: string };

export function CoachingBookingWizard({ services, exams, tutors, slots, initialService, error }: Props) {
  const [serviceId, setServiceId] = useState(services.some((service) => service.id === initialService) ? initialService! : "");
  const [examId, setExamId] = useState("");
  const [tutorId, setTutorId] = useState(ANY_TUTOR);
  const [slotId, setSlotId] = useState("");
  const [notes, setNotes] = useState("");
  const timeZone = useBrowserTimeZone();
  const [submitting, setSubmitting] = useState(false);

  const service = services.find((entry) => entry.id === serviceId);
  const examTutors = useMemo(() => tutors.filter((tutor) => !examId || tutor.exams.includes(examId)), [tutors, examId]);
  const visibleSlots = useMemo(() => slots.filter((slot) => (!examId || slot.tutorExams.includes(examId)) && (tutorId === ANY_TUTOR ? examTutors.some((tutor) => tutor.id === slot.tutorId) : slot.tutorId === tutorId)), [slots, examId, tutorId, examTutors]);
  const slot = visibleSlots.find((entry) => entry.id === slotId);
  const slotTutor = slot ? tutors.find((tutor) => tutor.id === slot.tutorId) : undefined;
  const step = !serviceId ? 1 : !examId ? 2 : !slotId ? 3 : 4;

  const stepHeader = (number: number, title: string) => <div className="flex items-center gap-3"><span className={cn("grid size-7 place-items-center rounded-full text-xs font-semibold", step >= number ? "bg-emerald-800 text-white" : "bg-muted text-muted-foreground")}>{number}</span><h2 className="font-semibold">{title}</h2></div>;

  return (
    <div className="space-y-6">
      {error ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p>{error}</p></div> : null}

      <section className="rounded-2xl border bg-background p-5">
        {stepHeader(1, "Session type")}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {services.map((entry) => <button key={entry.id} type="button" onClick={() => { setServiceId(entry.id); setSlotId(""); }} aria-pressed={serviceId === entry.id} className={cn("rounded-xl border p-4 text-left transition hover:border-emerald-600", serviceId === entry.id && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40")}><p className="font-medium">{entry.name}</p><p className="mt-1 text-xs text-muted-foreground">{entry.durationMinutes} min · {formatCad(entry.priceCents)}</p></button>)}
        </div>
      </section>

      <section className={cn("rounded-2xl border bg-background p-5", step < 2 && "opacity-60")}>
        {stepHeader(2, "Exam")}
        <div className="mt-4 flex flex-wrap gap-2">
          {exams.map((exam) => <button key={exam.id} type="button" disabled={!serviceId} onClick={() => { setExamId(exam.id); setTutorId(ANY_TUTOR); setSlotId(""); }} aria-pressed={examId === exam.id} className={cn("rounded-full border px-4 py-2 text-sm transition hover:border-emerald-600 disabled:cursor-not-allowed", examId === exam.id && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40")}>{exam.name}</button>)}
        </div>
      </section>

      <section className={cn("rounded-2xl border bg-background p-5", step < 3 && "opacity-60")}>
        {stepHeader(3, "Tutor and time")}
        {examId ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setTutorId(ANY_TUTOR); setSlotId(""); }} aria-pressed={tutorId === ANY_TUTOR} className={cn("rounded-full border px-4 py-2 text-sm transition hover:border-emerald-600", tutorId === ANY_TUTOR && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40")}>Any available tutor</button>
              {examTutors.map((tutor) => <button key={tutor.id} type="button" onClick={() => { setTutorId(tutor.id); setSlotId(""); }} aria-pressed={tutorId === tutor.id} className={cn("rounded-full border px-4 py-2 text-sm transition hover:border-emerald-600", tutorId === tutor.id && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40")}>{tutor.displayName}</button>)}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Times shown in <span className="font-medium text-foreground">{timeZone.replaceAll("_", " ")}</span>. Next 21 days.</p>
            {visibleSlots.length ? (
              <CoachingSlotCalendar slots={visibleSlots} tutors={tutors} showTutor={tutorId === ANY_TUTOR} slotId={slotId} onSelect={setSlotId} timeZone={timeZone} />
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{tutors.length ? "No open times in the next three weeks for this selection. Try another tutor or exam, or " : "Tutors for this exam are being onboarded. "}<Link href="/support" className="font-medium text-emerald-800 underline dark:text-emerald-400">contact support</Link> and we will find a time.</div>
            )}
          </>
        ) : <p className="mt-4 text-sm text-muted-foreground">Choose an exam to see availability.</p>}
      </section>

      <section className={cn("rounded-2xl border bg-background p-5", step < 4 && "opacity-60")}>
        {stepHeader(4, "Notes and payment")}
        <form action={createBooking} onSubmit={() => setSubmitting(true)} className="mt-4 space-y-4">
          <input type="hidden" name="serviceId" value={serviceId} />
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="slotId" value={slotId} />
          <label className="block text-sm font-medium" htmlFor="coaching-notes">What would you like to focus on? <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Textarea id="coaching-notes" name="notes" value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 2000))} disabled={!slotId} rows={4} placeholder="Weak topics, your exam date, what has not been working…" />
          {service && slot ? (
            <div className="rounded-xl bg-muted/60 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{service.name} · {service.durationMinutes} min</p><Badge variant="outline">{exams.find((exam) => exam.id === examId)?.name}</Badge></div>
              <p className="mt-2 text-muted-foreground">{formatDay(slot.startsAt, timeZone)} at {formatTime(slot.startsAt, timeZone)} with {slotTutor?.displayName ?? "your tutor"}</p>
              <p className="mt-3 text-lg font-semibold">{formatCad(service.priceCents)} <span className="text-xs font-normal text-muted-foreground">CAD, taxes shown at checkout</span></p>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" />Your time is held for 20 minutes while you pay on Stripe.</p>
            <div className="flex gap-2"><Link href="/coaching" className={buttonVariants({ variant: "outline" })}><ArrowLeft />Back</Link><Button type="submit" disabled={!slotId || submitting} className="bg-emerald-800 hover:bg-emerald-900">{submitting ? "Holding your time…" : service ? `Continue to payment (${formatCad(service.priceCents)})` : "Continue to payment"} <ArrowRight /></Button></div>
          </div>
        </form>
      </section>
    </div>
  );
}
