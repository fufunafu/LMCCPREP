"use client";
import { useState } from "react";
import { useStudy } from "@/components/study-provider";
import { studyStore } from "@/lib/study-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { conflictedSessions, operationSessionId } from "@/lib/study-core";

export async function prepareOfflineShell() {
  if (!("serviceWorker" in navigator)) throw new Error("Offline reloads are unavailable in this browser. Use a browser with service worker support.");
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error("The offline page could not finish downloading. Try again while connected.")), 60_000);
    channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); if (data.ok) resolve(); else reject(new Error(data.error)); };
    registration.active?.postMessage({ kind: "prepare-offline" }, [channel.port2]);
  });
}

export function OfflineStudySettings() {
  const { snapshot, ready, refreshing, syncing, error: syncError, figures } = useStudy();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const conflicts = snapshot ? conflictedSessions(snapshot) : new Map<string, string>();
  const backup = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify({ userId: snapshot.userId, examId: snapshot.examId, exportedAt: new Date().toISOString(), pending: snapshot.outbox, recovered: snapshot.recoveredOperations ?? [] }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "montreal-study-backup.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const download = async () => {
    setBusy(true); setError(""); setMessage("Saving study data and the offline page…");
    try {
      await studyStore.refresh();
      await prepareOfflineShell();
      await studyStore.downloadFigures();
      if (navigator.storage?.persist) await navigator.storage.persist();
      setMessage("Offline study is ready. Open this website in the same browser while offline.");
    } catch (e) { setError(e instanceof Error ? e.message : "Download failed. Reconnect and try again."); setMessage(""); }
    finally { setBusy(false); }
  };
  return <Card><CardHeader><CardTitle>Offline study</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Save your question bank, clinical figures, sessions, notes, plan and statistics in this browser before travelling. Access needs a refresh at least every 72 hours, or sooner if your subscription ends.</p>
    <p className="text-sm">{snapshot ? `${snapshot.questions.length.toLocaleString()} questions saved. ${snapshot.outbox.length} updates waiting to sync.` : "Connect and download your study data first."}</p>
    {snapshot && <p className="text-xs text-muted-foreground">Offline access through {new Date(snapshot.validUntil).toLocaleString()}.</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy || !ready || refreshing} onClick={() => void download()}>{busy ? "Downloading…" : "Download offline study"}</Button><Button variant="outline" disabled={busy || syncing || refreshing || !ready} onClick={async () => { setError(""); try { await studyStore.refresh(); setMessage("Study progress refreshed."); } catch (e) { setError((e as Error).message); } }}>{syncing || refreshing ? "Syncing…" : "Refresh my progress"}</Button></div>
    {conflicts.size > 0 && <section id="sync-conflicts" className="space-y-3 rounded-xl border p-4" aria-label="Sync conflicts"><h3 className="font-semibold">Resolve sync conflicts</h3><p className="text-sm text-muted-foreground">Choose the online version of a session to resume syncing. Its pending local changes will stay in a backup in this browser.</p>{[...conflicts].map(([id, reason]) => <div key={id} className="space-y-2 border-t pt-3"><p className="text-sm">{reason}</p><p className="text-xs text-muted-foreground">{snapshot?.outbox.filter((op) => operationSessionId(op) === id).length} local updates in this session</p><Button variant="outline" disabled={busy || syncing || refreshing} onClick={() => setResolving(id)}>Use online version</Button></div>)}</section>}
    {snapshot && (snapshot.outbox.length > 0 || Boolean(snapshot.recoveredOperations?.length)) && <div className="space-y-2"><Button variant="outline" onClick={backup}>Download study backup</Button>{Boolean(snapshot.recoveredOperations?.length) && <p className="text-xs text-muted-foreground">Resolved local changes are kept in this browser. Download the backup before signing out or clearing site data if you want to keep them.</p>}</div>}
    <Dialog open={Boolean(resolving)} onOpenChange={(open) => { if (!open && !busy) setResolving(null); }}><DialogContent><DialogHeader><DialogTitle>Use the online session?</DialogTitle><DialogDescription>The online answers and session progress will replace this session on this device. Pending local changes for this session will move to a downloadable backup. Notes, flags and other sessions will keep syncing.</DialogDescription></DialogHeader><DialogFooter><DialogClose render={<Button variant="outline" disabled={busy} />}>Cancel</DialogClose><Button disabled={busy || syncing || refreshing} onClick={async () => { if (!resolving) return; setBusy(true); setError(""); try { await studyStore.resolveConflict(resolving); setResolving(null); setMessage("Online session restored. Local changes are kept in your study backup."); } catch (e) { setError((e as Error).message); setResolving(null); } finally { setBusy(false); } }}>{busy ? "Restoring…" : "Use online version and keep backup"}</Button></DialogFooter></DialogContent></Dialog>
    {busy && figures.total > 0 && <p role="status" className="text-sm">{figures.saved} of {figures.total} clinical figures saved</p>}
    {snapshot && message && !error && !syncError && <p role="status" className="text-sm">{message}</p>}{(error || syncError) && <p role="alert" className="text-sm text-destructive">{error || syncError}</p>}
    <p className="text-xs text-muted-foreground">Browser storage can be cleared by your browser or device. Reconnect regularly to sync, and do not clear site data while updates are pending.</p>
  </CardContent></Card>;
}
