import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addAvailability, addWeeklyAvailability, deleteAvailability, setBookingMeetingUrl, setBookingStatus, setServiceLink, setTutorActive, upsertTutor } from "@/lib/coaching-actions";
import type { AdminSlot } from "@/lib/coaching";
import { bookingStatusLabel, formatCad, formatSlot, type CoachingBooking, type CoachingBookingStatus, type CoachingExam, type CoachingService, type CoachingTutor } from "@/lib/coaching-core";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUSES: CoachingBookingStatus[] = ["pending", "paid", "completed", "cancelled", "expired"];
const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";
const labelClass = "block text-xs font-medium text-muted-foreground";

type Props = { tutors: CoachingTutor[]; exams: CoachingExam[]; services: CoachingService[]; slots: AdminSlot[]; bookings: CoachingBooking[]; selectedTutorId?: string; statusFilter?: CoachingBookingStatus; adminTimeZone: string };

function TutorForm({ tutor, exams }: { tutor?: CoachingTutor; exams: CoachingExam[] }) {
  return (
    <ActionForm action={upsertTutor} success={tutor ? "Tutor saved" : "Tutor added"} reset={!tutor} className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-2">
      {tutor ? <input type="hidden" name="id" value={tutor.id} /> : null}
      <label className={labelClass}>Display name<Input name="displayName" defaultValue={tutor?.displayName} required maxLength={80} className="mt-1" /></label>
      <label className={labelClass}>Headline<Input name="headline" defaultValue={tutor?.headline} maxLength={160} placeholder="Passed MCCQE Part I in 2025 · Family medicine R2" className="mt-1" /></label>
      <label className={`${labelClass} sm:col-span-2`}>Bio<Textarea name="bio" defaultValue={tutor?.bio} maxLength={2000} rows={3} className="mt-1" /></label>
      <label className={labelClass}>Timezone (IANA)<Input name="timezone" defaultValue={tutor?.timezone ?? "America/Toronto"} className="mt-1" /></label>
      <label className={labelClass}>Sort<Input name="sort" type="number" defaultValue={tutor?.sort ?? 0} className="mt-1" /></label>
      <fieldset className="sm:col-span-2"><legend className={labelClass}>Exams</legend><div className="mt-1 flex flex-wrap gap-3 text-sm">{exams.map((exam) => <label key={exam.id} className="flex items-center gap-1.5"><input type="checkbox" name="exams" value={exam.id} defaultChecked={tutor?.exams.includes(exam.id)} />{exam.name}</label>)}</div></fieldset>
      <label className={labelClass}>Link to account email (optional)<Input name="userEmail" type="email" placeholder={tutor?.userId ? "Linked" : "tutor@example.com"} className="mt-1" /></label>
      <div className="flex items-end gap-4 text-sm"><label className="flex items-center gap-1.5"><input type="checkbox" name="active" defaultChecked={tutor?.active ?? false} />Active (shown publicly)</label>{tutor?.userId ? <label className="flex items-center gap-1.5"><input type="checkbox" name="clearUser" />Unlink account</label> : null}</div>
      <div className="sm:col-span-2"><Button type="submit" size="sm" className="bg-emerald-800 hover:bg-emerald-900">{tutor ? "Save tutor" : "Add tutor"}</Button></div>
    </ActionForm>
  );
}

export function CoachingAdmin({ tutors, exams, services, slots, bookings, selectedTutorId, statusFilter, adminTimeZone }: Props) {
  const tutorName = (id: string) => tutors.find((tutor) => tutor.id === id)?.displayName ?? "Unknown tutor";
  const flagged = bookings.filter((booking) => booking.adminNote);
  return (
    <Tabs defaultValue={flagged.length ? "bookings" : "tutors"}>
      <TabsList className="flex-wrap"><TabsTrigger value="tutors">Tutors</TabsTrigger><TabsTrigger value="availability">Availability</TabsTrigger><TabsTrigger value="bookings">Bookings{flagged.length ? <Badge variant="destructive">{flagged.length}</Badge> : null}</TabsTrigger><TabsTrigger value="services">Services</TabsTrigger></TabsList>

      <TabsContent value="tutors" className="space-y-4 pt-4">
        {tutors.map((tutor) => <details key={tutor.id} className="group rounded-2xl border bg-background"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-3"><span className="font-medium">{tutor.displayName}</span><span className="text-xs text-muted-foreground">{tutor.exams.join(", ") || "no exams"} · {tutor.timezone}</span></div><div className="flex items-center gap-2"><Badge variant={tutor.active ? "default" : "outline"}>{tutor.active ? "Active" : "Hidden"}</Badge><ActionForm action={setTutorActive} success="Updated"><input type="hidden" name="id" value={tutor.id} /><input type="hidden" name="active" value={tutor.active ? "false" : "true"} /><Button type="submit" size="sm" variant="outline">{tutor.active ? "Hide" : "Publish"}</Button></ActionForm></div></summary><div className="border-t p-4"><TutorForm tutor={tutor} exams={exams} /></div></details>)}
        <details className="rounded-2xl border border-dashed bg-background"><summary className="cursor-pointer list-none px-4 py-3 font-medium">+ Add a tutor</summary><div className="border-t p-4"><TutorForm exams={exams} /></div></details>
      </TabsContent>

      <TabsContent value="availability" className="space-y-4 pt-4">
        <form method="get" className="flex flex-wrap items-end gap-3"><label className={labelClass}>Tutor<select name="tutor" defaultValue={selectedTutorId ?? ""} className={`${selectClass} mt-1 w-64`}><option value="">All tutors</option>{tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.displayName}</option>)}</select></label><Button type="submit" size="sm" variant="outline">Show</Button></form>
        <div className="grid gap-4 lg:grid-cols-2">
          <ActionForm action={addWeeklyAvailability} success="Slots added" className="space-y-3 rounded-2xl border bg-background p-4">
            <p className="font-medium">Weekly pattern</p>
            <label className={labelClass}>Tutor<select name="tutorId" defaultValue={selectedTutorId ?? ""} required className={`${selectClass} mt-1`}><option value="" disabled>Choose…</option>{tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.displayName} ({tutor.timezone})</option>)}</select></label>
            <fieldset><legend className={labelClass}>Weekdays</legend><div className="mt-1 flex flex-wrap gap-2 text-sm">{WEEKDAYS.map((day, index) => <label key={day} className="flex items-center gap-1"><input type="checkbox" name="weekdays" value={index} defaultChecked={index >= 1 && index <= 5} />{day}</label>)}</div></fieldset>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className={labelClass}>From<Input name="startTime" type="time" defaultValue="18:00" required className="mt-1" /></label><label className={labelClass}>To<Input name="endTime" type="time" defaultValue="21:00" required className="mt-1" /></label><label className={labelClass}>Slot (min)<Input name="slotMinutes" type="number" min={15} max={240} step={15} defaultValue={60} className="mt-1" /></label><label className={labelClass}>Weeks<Input name="weeks" type="number" min={1} max={12} defaultValue={4} className="mt-1" /></label></div>
            <p className="text-xs text-muted-foreground">Times are in the tutor&apos;s timezone. Existing slots are kept; duplicates are skipped.</p>
            <Button type="submit" size="sm" className="bg-emerald-800 hover:bg-emerald-900">Generate slots</Button>
          </ActionForm>
          <ActionForm action={addAvailability} success="Slots added" reset className="space-y-3 rounded-2xl border bg-background p-4">
            <p className="font-medium">Single day</p>
            <label className={labelClass}>Tutor<select name="tutorId" defaultValue={selectedTutorId ?? ""} required className={`${selectClass} mt-1`}><option value="" disabled>Choose…</option>{tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.displayName} ({tutor.timezone})</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Date<Input name="date" type="date" required className="mt-1" /></label><label className={labelClass}>Slot (min)<Input name="durationMinutes" type="number" min={15} max={240} step={15} defaultValue={60} className="mt-1" /></label></div>
            <label className={labelClass}>Start times (HH:MM, comma-separated)<Input name="times" placeholder="09:00, 10:00, 14:30" required className="mt-1" /></label>
            <Button type="submit" size="sm" className="bg-emerald-800 hover:bg-emerald-900">Add slots</Button>
          </ActionForm>
        </div>
        <div className="rounded-2xl border bg-background">
          <Table><TableHeader><TableRow><TableHead>When ({adminTimeZone})</TableHead><TableHead>Tutor</TableHead><TableHead>State</TableHead><TableHead className="text-right">Delete</TableHead></TableRow></TableHeader>
            <TableBody>{slots.length ? slots.map((slot) => <TableRow key={slot.id}><TableCell>{formatSlot(slot.startsAt, adminTimeZone)}</TableCell><TableCell>{tutorName(slot.tutorId)}</TableCell><TableCell>{slot.booking ? <Badge variant={slot.booking.status === "paid" ? "default" : "secondary"}>{bookingStatusLabel(slot.booking.status)}</Badge> : <Badge variant="outline">Open</Badge>}</TableCell><TableCell className="text-right">{slot.booking?.status === "paid" ? null : <ActionForm action={deleteAvailability} success="Slot deleted" confirm="Delete this slot?"><input type="hidden" name="id" value={slot.id} /><Button type="submit" size="sm" variant="ghost">Delete</Button></ActionForm>}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No upcoming slots.</TableCell></TableRow>}</TableBody></Table>
        </div>
      </TabsContent>

      <TabsContent value="bookings" className="space-y-4 pt-4">
        <div className="flex flex-wrap gap-2 text-sm"><Link href="/coaching/admin" className={`rounded-full border px-3 py-1 ${!statusFilter ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : ""}`}>All</Link>{STATUSES.map((status) => <Link key={status} href={`/coaching/admin?status=${status}`} className={`rounded-full border px-3 py-1 ${statusFilter === status ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : ""}`}>{bookingStatusLabel(status)}</Link>)}</div>
        {bookings.length ? bookings.map((booking) => (
          <div key={booking.id} className={`rounded-2xl border bg-background p-4 ${booking.adminNote ? "border-red-400" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-medium">{booking.serviceName} · {booking.examName} · {formatCad(booking.amountCents)}</p><p className="mt-1 text-sm text-muted-foreground">{booking.startsAt ? formatSlot(booking.startsAt, adminTimeZone) : "No slot"} · {booking.tutorName} · {booking.userEmail ?? booking.userId}</p>{booking.notes ? <p className="mt-2 whitespace-pre-wrap text-sm">{booking.notes}</p> : null}{booking.adminNote ? <p className="mt-2 text-sm font-semibold text-red-600">{booking.adminNote}</p> : null}<p className="mt-2 text-[11px] text-muted-foreground">{booking.id}</p></div>
              <Badge>{bookingStatusLabel(booking.status)}</Badge>
            </div>
            {booking.status === "paid" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionForm action={setBookingMeetingUrl} success="Meeting link saved" className="flex flex-1 gap-2"><input type="hidden" name="id" value={booking.id} /><Input name="meetingUrl" type="url" defaultValue={booking.meetingUrl ?? ""} placeholder="https://meet.google.com/…" className="min-w-56" /><Button type="submit" size="sm" variant="outline">Save link</Button></ActionForm>
                <ActionForm action={setBookingStatus} success="Marked completed"><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="completed" /><Button type="submit" size="sm" variant="outline">Mark completed</Button></ActionForm>
                <ActionForm action={setBookingStatus} success="Booking cancelled" confirm="Cancel this paid booking? Refund it in Stripe separately."><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="cancelled" /><Button type="submit" size="sm" variant="ghost">Cancel</Button></ActionForm>
              </div>
            ) : null}
          </div>
        )) : <p className="text-sm text-muted-foreground">No bookings.</p>}
      </TabsContent>

      <TabsContent value="services" className="space-y-4 pt-4">
        <p className="text-sm text-muted-foreground">Each service needs a Stripe Payment Link for a one-time price. Set the link&apos;s after-payment redirect to <code className="rounded bg-muted px-1">{"<site>"}/coaching/bookings?paid=1</code>. The booking reference is passed automatically as <code className="rounded bg-muted px-1">client_reference_id</code>.</p>
        {services.map((service) => <ActionForm key={service.id} action={setServiceLink} success="Service saved" className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end"><input type="hidden" name="id" value={service.id} /><div><p className="font-medium">{service.name}</p><p className="text-xs text-muted-foreground">{service.durationMinutes} min · {formatCad(service.priceCents)}</p></div><label className={labelClass}>Payment Link<Input name="paymentLink" defaultValue={service.paymentLink ?? ""} placeholder="https://buy.stripe.com/…" className="mt-1" /></label><label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" defaultChecked={service.active} />Active</label><Button type="submit" size="sm" variant="outline">Save</Button></ActionForm>)}
      </TabsContent>
    </Tabs>
  );
}
