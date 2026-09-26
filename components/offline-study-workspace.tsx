"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { StudyProvider, useStudy, useStudyTime } from "@/components/study-provider";
import { AppShell } from "@/components/app-shell";
import { CreateSession } from "@/components/create-session";
import { DashboardView } from "@/components/dashboard-view";
import { StatsView } from "@/components/stats-view";
import { StudySession } from "@/components/study-session";
import { PersonalStudyCard, StudyTutorial } from "@/components/study-tools";
import { OfflineStudySettings } from "@/components/offline-study-settings";
import { useStudyNavigation } from "@/lib/study-navigation";
import { makeStudySession, studyStatistics } from "@/lib/study-core";
import { saveStudy } from "@/lib/study-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
const subscribe = (notify: () => void) => { window.addEventListener("hashchange", notify); return () => window.removeEventListener("hashchange", notify); };
function currentPath() { return location.hash.slice(1) || (location.pathname === "/offline" ? "/dashboard" : location.pathname + location.search); }
export function OfflineStudyWorkspace() { return <StudyProvider><OfflineContent /></StudyProvider>; }
function OfflineContent() {
  const { snapshot, ready, error, syncing } = useStudy();
  const now = useStudyTime();
  const path = useSyncExternalStore(subscribe, currentPath, () => "/dashboard");
  if (!ready) return <main id="main-content" className="p-8" role="status">Opening saved study data…</main>;
  if (!snapshot) return <main id="main-content" className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-2xl font-semibold">No offline study data saved</h1><p>{error ?? "Connect to the internet, sign in, then choose Download offline study in Settings."}</p><Link href="/login" className="underline">Sign in online</Link></main>;
  if (Date.parse(snapshot.validUntil) <= now) return <main id="main-content" className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-2xl font-semibold">Refresh your study access</h1><p>Your saved work is kept. Reconnect and sign in to the same account before continuing.</p><a href="/login" className="underline">Sign in to refresh access</a><OfflineStudySettings /></main>;
  const url = new URL(path, "https://offline.local");
  const sessionMatch = url.pathname.match(/^\/session\/([^/]+)(\/review)?$/);
  const computed = studyStatistics(snapshot);
  let content;
  if (sessionMatch) content = <StudySession key={path} id={sessionMatch[1]} review={Boolean(sessionMatch[2])} query={url.search} />;
  else if (url.pathname === "/create") content = <CreateSession subjects={snapshot.subjects} topics={snapshot.topics} exam={snapshot.exam} />;
  else if (url.pathname === "/stats") content = <StatsView subjects={snapshot.subjects} topics={snapshot.topics} stats={computed.topicStats} activity={computed.stats.activity} flagged={snapshot.questions.filter((q) => snapshot.flags.includes(q.id))} flaggedTotal={snapshot.flags.length} />;
  else if (url.pathname === "/settings") content = <div className="mx-auto max-w-4xl space-y-5 p-6"><h1 className="text-2xl font-semibold">Study settings</h1><PersonalStudyCard /><OfflineStudySettings /><StudyTutorial /><p className="text-sm text-muted-foreground">Profile, billing and account changes are available after reconnecting.</p></div>;
  else if (url.pathname === "/questions") content = <OfflineLibrary initialFilter={url.searchParams.get("status") ?? "all"} />;
  else content = <DashboardView stats={computed.stats} subjects={snapshot.subjects} topics={snapshot.topics} recentSessions={computed.sessions.slice(0, 4)} userName={snapshot.profile.name} examName={snapshot.exam.shortName} profile={snapshot.profile} />;
  return <AppShell user={snapshot.profile} demo={snapshot.demo} exams={[snapshot.exam]} currentExamId={snapshot.examId}><div role="status" className="border-b bg-muted px-4 py-2 text-xs">Saved study workspace · {syncing ? "Syncing" : `${snapshot.outbox.length} pending updates`}{error ? ` · ${error}` : ""}</div>{content}</AppShell>;
}
function OfflineLibrary({ initialFilter }: { initialFilter: string }) {
  const { snapshot } = useStudy(); const navigate = useStudyNavigation();
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState(initialFilter);
  const [page, setPage] = useState(0);
  if (!snapshot) return null;
  const rows = snapshot.questions.filter((q) => (filter !== "flagged" || snapshot.flags.includes(q.id)) && (filter !== "notes" || snapshot.notes[q.id]) && `${q.qid} ${q.stem}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="mx-auto max-w-4xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Saved questions</h1><Input aria-label="Search saved questions" placeholder="Search by wording or question ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /><div className="flex gap-2">{["all", "flagged", "notes"].map((f) => <Button key={f} variant={filter === f ? "default" : "outline"} aria-pressed={filter === f} onClick={() => { setFilter(f); setPage(0); }}>{f === "all" ? "All questions" : f === "notes" ? "With notes" : "Flagged"}</Button>)}</div><p className="text-sm text-muted-foreground">{rows.length} questions</p>{rows.slice(page * 30, (page + 1) * 30).map((q) => <div key={q.id} className="space-y-2 rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">Question {q.qid}</p><p className="line-clamp-3 text-sm">{q.stem}</p>{snapshot.notes[q.id] && <p className="text-sm text-muted-foreground">Your note: {snapshot.notes[q.id]}</p>}<Button variant="outline" size="sm" onClick={async () => { try { const session = makeStudySession(snapshot, { mode: "tutor", count: 1, exactIds: [q.id], filters: { subjectIds: [], topicIds: [], status: "all" } }, crypto.randomUUID()); await saveStudy({ kind: "session", session }); navigate(`/session/${session.id}`); } catch (e) { toast.error((e as Error).message); } }}>Practice question</Button></div>)}<div className="flex justify-between"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</Button><Button variant="outline" disabled={(page + 1) * 30 >= rows.length} onClick={() => setPage(page + 1)}>Next page</Button></div></div>;
}
