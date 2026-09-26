"use client";
import Link from "next/link";
import { useStudy } from "@/components/study-provider";
import { conflictedSessions } from "@/lib/study-core";
import { studyStore } from "@/lib/study-store";
import { Button } from "@/components/ui/button";

export function StudyStatus() {
  const { snapshot, error, syncing, refreshing, ready } = useStudy();
  const conflicts = snapshot ? conflictedSessions(snapshot).size : 0;
  const pending = snapshot?.outbox.length ?? 0;
  if (!error && !conflicts && !pending) return null;
  return <div role={error || conflicts ? "alert" : "status"} className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted px-4 py-3 text-sm">
    <p>{conflicts ? `${conflicts} ${conflicts === 1 ? "session needs" : "sessions need"} a sync decision. Your work is saved here; other updates can still upload.` : error ?? (syncing ? "Syncing your saved work…" : `${pending} updates saved on this device, waiting to sync.`)}</p>
    <div className="flex flex-wrap items-center gap-3">{conflicts > 0 && <Link href="/settings#sync-conflicts" className="font-medium underline">Resolve sync conflicts</Link>}
      {error && <Button size="sm" variant="outline" disabled={!ready || refreshing || syncing} onClick={() => void studyStore.refresh().catch(() => undefined)}>{refreshing ? "Retrying…" : "Retry study data"}</Button>}
    </div>
  </div>;
}
