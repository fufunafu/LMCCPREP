import Link from "next/link";
import { CalendarCheck, CreditCard, GraduationCap, MessagesSquare, Video } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCad, type CoachingExam, type CoachingService, type CoachingTutor } from "@/lib/coaching-core";
import { coachingFaqs } from "@/lib/marketing-content";

const icons = { consult30: MessagesSquare, tutor60: GraduationCap, strategy45: CalendarCheck } as Record<string, typeof GraduationCap>;

export function CoachingServicesSection({ services, exams }: { services: CoachingService[]; exams: CoachingExam[] }) {
  return (
    <section id="sessions" aria-labelledby="coaching-sessions-title" className="scroll-mt-20 border-y border-slate-200/70 bg-white py-20 dark:border-white/10 dark:bg-slate-950/50">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl"><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Sessions</p><h2 id="coaching-sessions-title" className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Pick the kind of help you need.</h2><p className="mt-4 leading-7 text-muted-foreground">Every session is one-on-one, online, and led by someone who has already passed the exam you are preparing for: {exams.map((exam) => exam.name).join(", ")}.</p></div>
        {services.length === 0 ? <div className="mt-10 rounded-2xl border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">Session booking is opening soon. <Link href="/support" className="font-medium text-emerald-800 underline dark:text-emerald-400">Contact support</Link> to arrange a session in the meantime.</div> : null}
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {services.map((service) => { const Icon = icons[service.id] ?? GraduationCap; return (
            <div key={service.id} className="flex flex-col rounded-2xl border bg-background p-6">
              <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="size-5" /></div>
              <h3 className="mt-5 text-lg font-semibold">{service.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{service.durationMinutes} minutes · online</p>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{service.description}</p>
              <p className="mt-5 text-3xl font-semibold">{formatCad(service.priceCents)}</p>
              <Link href={`/coaching/book?service=${service.id}`} className={buttonVariants({ className: "mt-5 w-full bg-emerald-800 hover:bg-emerald-900" })}>Book {service.name.toLowerCase()}</Link>
            </div>
          ); })}
        </div>
        <p className="mt-6 text-xs leading-5 text-muted-foreground">Prices are in CAD. Payment is taken in advance through Stripe when you reserve a time; applicable taxes are shown before you pay.</p>
      </div>
    </section>
  );
}

export function CoachingHowItWorksSection() {
  const steps = [
    { icon: CalendarCheck, title: "Choose a session", copy: "Pick a consultation, a tutoring hour, or a strategy session, and the exam you are sitting." },
    { icon: GraduationCap, title: "Pick a tutor and a time", copy: "See live availability for tutors who passed your exam, shown in your own timezone." },
    { icon: CreditCard, title: "Pay securely with Stripe", copy: "Your time is held for 20 minutes while you check out. Payment confirms the booking." },
    { icon: Video, title: "Get your meeting link", copy: "We add a video link to your booking before the session. Join from the Coaching page in your account." },
  ];
  return (
    <section aria-labelledby="coaching-how-title" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">How it works</p>
      <h2 id="coaching-how-title" className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Booked in a couple of minutes.</h2>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ icon: Icon, title, copy }, index) => <li key={title} className="rounded-2xl border bg-background p-6"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-emerald-800 text-sm font-semibold text-white">{index + 1}</span><Icon className="size-5 text-emerald-700 dark:text-emerald-300" /></div><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p></li>)}
      </ol>
    </section>
  );
}

export function CoachingTutorsSection({ tutors, exams }: { tutors: CoachingTutor[]; exams: CoachingExam[] }) {
  const examName = (id: string) => exams.find((exam) => exam.id === id)?.name ?? id;
  return (
    <section id="tutors" aria-labelledby="coaching-tutors-title" className="scroll-mt-20 border-y border-slate-200/70 bg-white py-20 dark:border-white/10 dark:bg-slate-950/50">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl"><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Tutors</p><h2 id="coaching-tutors-title" className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">People who have sat the exam you are studying for.</h2></div>
        {tutors.length ? (
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tutors.map((tutor) => <div key={tutor.id} className="rounded-2xl border bg-background p-6"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-full bg-emerald-800 text-sm font-semibold text-white">{tutor.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div><h3 className="font-semibold">{tutor.displayName}</h3><p className="text-xs text-muted-foreground">{tutor.headline}</p></div></div>{tutor.bio ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{tutor.bio}</p> : null}<div className="mt-4 flex flex-wrap gap-1.5">{tutor.exams.map((exam) => <Badge key={exam} variant="outline">{examName(exam)}</Badge>)}</div></div>)}
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed bg-background p-8 text-center"><p className="font-medium">Our first tutors are being onboarded.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Book a consultation and we will match you with someone who has passed your exam, or check back soon for named profiles and live availability.</p></div>
        )}
      </div>
    </section>
  );
}

export function CoachingFaqSection() {
  return (
    <section id="coaching-faq" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-20 sm:px-8">
      <div className="text-center"><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Good to know</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Before you book</h2></div>
      <div className="mt-10 divide-y rounded-2xl border bg-background px-5 sm:px-7">{coachingFaqs.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{question}<span className="text-xl text-muted-foreground group-open:rotate-45">+</span></summary><p className="max-w-2xl pt-3 text-sm leading-6 text-muted-foreground">{answer}</p></details>)}</div>
      <p className="mt-10 text-center text-sm text-muted-foreground">Need something else? <Link href="/support" className="font-medium text-emerald-800 underline dark:text-emerald-400">Contact support</Link>.</p>
    </section>
  );
}
