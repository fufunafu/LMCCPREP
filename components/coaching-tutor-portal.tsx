import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tutorAddAvailability, tutorAddWeeklyAvailability, tutorDeleteAvailability, tutorSetBooking, tutorUpdateProfile } from "@/lib/coaching-actions";
import type { AdminSlot } from "@/lib/coaching";
import { bookingStatusLabel, formatCad, formatSlot, type CoachingBooking, type CoachingExam, type CoachingTutor } from "@/lib/coaching-core";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const labelClass = "block text-xs font-medium text-muted-foreground";

type Props = { tutor: CoachingTutor; exams: CoachingExam[]; slots: AdminSlot[]; bookings: CoachingBooking[] };

export function CoachingTutorPortal({ tutor, exams, slots, bookings }: Props) {
  const tz = tutor.timezone;
  const upcoming = bookings.filter((booking) => booking.status === "paid");
  const examNames = tutor.exams.map((id) => exams.find((exam) => exam.id === id)?.name ?? id);
  return (
    <div className="space-y-6">
      {!tutor.active ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">Your profile is not published yet. You can add availability now; learners will see it once an admin publishes your profile.</p> : null}
      <Tabs defaultValue={upcoming.length ? "bookings" : "availability"}>
        <TabsList className="flex-wrap"><TabsTrigger value="availability">Availability</TabsTrigger><TabsTrigger value="bookings">Bookings{upcoming.length ? <Badge>{upcoming.length}</Badge> : null}</TabsTrigger><TabsTrigger value="profile">Profile</TabsTrigger></TabsList>

        <TabsContent value="availability" className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ActionForm action={tutorAddWeeklyAvailability} success="Slots added" className="space-y-3 rounded-2xl border bg-background p-4">
              <p className="font-medium">Weekly pattern</p>
              <fieldset><legend className={labelClass}>Weekdays</legend><div className="mt-1 flex flex-wrap gap-2 text-sm">{WEEKDAYS.map((day, index) => <label key={day} className="flex items-center gap-1"><input type="checkbox" name="weekdays" value={index} defaultChecked={index === 3 || index === 4} />{day}</label>)}</div></fieldset>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className={labelClass}>From<Input name="startTime" type="time" defaultValue="19:00" required className="mt-1" /></label><label className={labelClass}>To<Input name="endTime" type="time" defaultValue="20:00" required className="mt-1" /></label><label className={labelClass}>Slot (min)<Input name="slotMinutes" type="number" min={15} max={240} step={15} defaultValue={30} className="mt-1" /></label><label className={labelClass}>Weeks<Input name="weeks" type="number" min={1} max={12} defaultValue={4} className="mt-1" /></label></div>
              <p className="text-xs text-muted-foreground">Times are in your timezone ({tz}). Existing slots are kept; duplicates are skipped.</p>
              <Button type="submit" size="sm" className="bg-emerald-800 hover:bg-emerald-900">Generate slots</Button>
            </ActionForm>
            <ActionForm action={tutorAddAvailability} success="Slots added" reset className="space-y-3 rounded-2xl border bg-background p-4">
              <p className="font-medium">Single day</p>
              <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Date<Input name="date" type="date" required className="mt-1" /></label><label className={labelClass}>Slot (min)<Input name="durationMinutes" type="number" min={15} max={240} step={15} defaultValue={30} className="mt-1" /></label></div>
              <label className={labelClass}>Start times (HH:MM, comma-separated)<Input name="times" placeholder="19:00, 19:30" required className="mt-1" /></label>
              <Button type="submit" size="sm" className="bg-emerald-800 hover:bg-emerald-900">Add slots</Button>
            </ActionForm>
          </div>
          <div className="rounded-2xl border bg-background">
            <Table><TableHeader><TableRow><TableHead>When ({tz})</TableHead><TableHead>State</TableHead><TableHead className="text-right">Delete</TableHead></TableRow></TableHeader>
              <TableBody>{slots.length ? slots.map((slot) => <TableRow key={slot.id}><TableCell>{formatSlot(slot.startsAt, tz)}</TableCell><TableCell>{slot.booking ? <Badge variant={slot.booking.status === "paid" ? "default" : "secondary"}>{bookingStatusLabel(slot.booking.status)}</Badge> : <Badge variant="outline">Open</Badge>}</TableCell><TableCell className="text-right">{slot.booking?.status === "paid" ? null : <ActionForm action={tutorDeleteAvailability} success="Slot deleted" confirm="Delete this slot?"><input type="hidden" name="id" value={slot.id} /><Button type="submit" size="sm" variant="ghost">Delete</Button></ActionForm>}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No upcoming slots. Add some above.</TableCell></TableRow>}</TableBody></Table>
          </div>
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4 pt-4">
          {bookings.length ? bookings.map((booking) => (
            <div key={booking.id} className="rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium">{booking.serviceName} · {booking.examName} · {formatCad(booking.amountCents)}</p><p className="mt-1 text-sm text-muted-foreground">{booking.startsAt ? formatSlot(booking.startsAt, tz) : "No slot"} · {booking.userEmail ?? "Learner"}</p>{booking.notes ? <p className="mt-2 whitespace-pre-wrap text-sm">{booking.notes}</p> : null}</div>
                <Badge>{bookingStatusLabel(booking.status)}</Badge>
              </div>
              {booking.status === "paid" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionForm action={tutorSetBooking} success="Meeting link saved" className="flex flex-1 gap-2"><input type="hidden" name="id" value={booking.id} /><Input name="meetingUrl" type="url" defaultValue={booking.meetingUrl ?? ""} placeholder="https://meet.google.com/…" className="min-w-56" /><Button type="submit" size="sm" variant="outline">Save link</Button></ActionForm>
                  <ActionForm action={tutorSetBooking} success="Marked completed"><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="completed" /><Button type="submit" size="sm" variant="outline">Mark completed</Button></ActionForm>
                  <ActionForm action={tutorSetBooking} success="Booking cancelled" confirm="Cancel this paid session? Support will refund the learner."><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="cancelled" /><Button type="submit" size="sm" variant="ghost">Cancel</Button></ActionForm>
                </div>
              ) : null}
            </div>
          )) : <p className="text-sm text-muted-foreground">No bookings yet.</p>}
        </TabsContent>

        <TabsContent value="profile" className="pt-4">
          <ActionForm action={tutorUpdateProfile} success="Profile saved" className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><p className="font-medium">{tutor.displayName}</p><p className="text-xs text-muted-foreground">Exams: {examNames.join(", ") || "none yet"} · Name and exams are set by an admin.</p></div>
            <label className={`${labelClass} sm:col-span-2`}>Headline<Input name="headline" defaultValue={tutor.headline} maxLength={160} placeholder="Passed MCCQE Part I in 2025 · Family medicine R2" className="mt-1" /></label>
            <label className={`${labelClass} sm:col-span-2`}>Bio<Textarea name="bio" defaultValue={tutor.bio} maxLength={2000} rows={4} className="mt-1" /></label>
            <label className={labelClass}>Timezone (IANA)<Input name="timezone" defaultValue={tutor.timezone} className="mt-1" /></label>
            <div className="flex items-end"><Button type="submit" size="sm" className="bg-emerald-800 hover:bg-emerald-900">Save profile</Button></div>
          </ActionForm>
        </TabsContent>
      </Tabs>
    </div>
  );
}
