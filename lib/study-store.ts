"use client";

import { applyStudyOperation, isSessionRemoved, mergeStudySnapshot, nextSyncOperation, operationSessionId, resolveSessionConflict, validateStudyPlan, type StudyOperation, type StudyPlan, type StudySnapshot } from "@/lib/study-core";
import type { Attempt, Profile, Question } from "@/lib/types";

const DB = "montreal-study-v1";
const MARKER = "montreal-study-active-v1";
type StoreState = { snapshot: StudySnapshot | null; ready: boolean; refreshing: boolean; syncing: boolean; error: string | null; figures: { saved: number; total: number } };
type DownloadPage = { userId: string; examId: string; questions?: Question[]; attempts?: Attempt[]; notes?: Record<string, string>; next: string | null; error?: string };
let state: StoreState = { snapshot: null, ready: false, refreshing: false, syncing: false, error: null, figures: { saved: 0, total: 0 } };
const serverState = state;
const listeners = new Set<() => void>();
let scope: string | null = null;
let generation = 0;
let channel: BroadcastChannel | undefined;
let opening: Promise<void> | null = null;
let syncing: Promise<void> | null = null;
let refreshing: { key: string; promise: Promise<void> } | null = null;
const refreshJournals = new Map<string, StudyOperation[]>();
let fallbackLock = Promise.resolve();
const keyFor = (s: Pick<StudySnapshot, "userId" | "examId">) => `${s.userId}:${s.examId}`;
function publish(update: Partial<StoreState>) { state = { ...state, ...update }; listeners.forEach((fn) => fn()); }
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Browser storage is unavailable. Allow site storage to save your study progress."));
  });
}
async function read(key: string): Promise<StudySnapshot | null> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly"); const records = tx.objectStore("records");
    const progress = records.get(key); const bank = records.get(`bank:${key}`);
    tx.oncomplete = () => resolve(progress.result ? { ...progress.result, questions: bank.result ?? [] } : null);
    tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function write(key: string, snapshot: StudySnapshot, bank = false): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("records", "readwrite"); const records = tx.objectStore("records");
    const { questions, ...progress } = snapshot;
    records.put(progress, key); if (bank) records.put(questions, `bank:${key}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("Could not save on this device. Free some browser storage and try again; the question has not advanced."));
    tx.onabort = () => reject(new Error("The local save was interrupted. Try again."));
  }); } finally { db.close(); }
}
async function activate(key: string | null): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("records", "readwrite"); const records = tx.objectStore("records"); if (key) records.put(key, "__active"); else records.delete("__active"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
}
async function locked<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request(name, action);
  const prior = fallbackLock; let release!: () => void;
  fallbackLock = new Promise<void>((resolve) => { release = resolve; });
  await prior;
  try { return await action(); } finally { release(); }
}
async function change(transform: (snapshot: StudySnapshot) => StudySnapshot, bank = false): Promise<StudySnapshot> {
  const key = scope; const token = generation;
  if (!key || !state.snapshot) throw new Error("Wait for your study data to load.");
  return locked(`study-data:${key}`, async () => {
    const latest = await read(key) ?? state.snapshot!;
    if (generation !== token || scope !== key) throw new Error("The signed-in account changed.");
    const next = transform(latest);
    if (keyFor(next) !== key) throw new Error("Study data belongs to a different account or exam.");
    await write(key, next, bank);
    if (generation === token) publish({ snapshot: next });
    channel?.postMessage(key);
    return next;
  });
}
function prepareChannel() {
  if (channel || !("BroadcastChannel" in window)) return;
  channel = new BroadcastChannel("montreal-study");
  channel.onmessage = async ({ data }) => {
    if (typeof data === "object" && data?.active && scope && data.active.split(":")[0] !== scope.split(":")[0]) { generation++; scope = null; publish({ snapshot: null, ready: true, error: "The signed-in account changed in another tab. Reload while online." }); return; }
    if (data === "clear") { generation++; scope = null; publish({ snapshot: null, ready: true, error: "Study data was cleared in another tab." }); return; }
    if (data === scope) { const key = scope; const loaded = await read(key!); if (scope === key) publish({ snapshot: loaded }); }
  };
}
async function accountChanged(nextKey: string) {
  generation++; scope = null;
  localStorage.removeItem(MARKER);
  publish({ snapshot: null, ready: true, error: "Your account or exam changed. Reload this page while online. Pending work remains saved for its original account." });
  channel?.postMessage({ active: nextKey });
  await activate(null);
}
export const studyStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getSnapshot: () => state,
  getServerSnapshot: () => serverState,
  async open(userId?: string, examId?: string) {
    const key = userId && examId ? `${userId}:${examId}` : localStorage.getItem(MARKER);
    if (key && scope === key && state.ready) return;
    if (opening && scope === key) return opening;
    const previous = localStorage.getItem(MARKER);
    // Keep pending work scoped to its original account, even if another account signs in.
    if (userId && previous && previous.split(":")[0] !== userId) localStorage.removeItem(MARKER);
    const token = ++generation; scope = key; prepareChannel();
    if (key) channel?.postMessage({ active: key });
    publish({ snapshot: null, ready: false, error: null });
    opening = (async () => {
      try {
        await activate(key);
        const saved = key ? await read(key) : null;
        if (generation !== token) return;
        if (saved) { await write(key!, saved); localStorage.setItem(MARKER, key!); publish({ snapshot: saved }); }
        publish({ ready: true });
        if (key && navigator.onLine) await this.refresh();
      } catch (error) { if (generation === token) publish({ ready: true, error: error instanceof Error ? error.message : "Study data is unavailable." }); }
      finally { if (generation === token) opening = null; }
    })();
    return opening;
  },
  async refresh() {
    const key = scope;
    if (!key) throw new Error("Sign in before downloading the question bank.");
    if (refreshing?.key === key) return refreshing.promise;
    const token = generation;
    publish({ refreshing: true, error: null });
    const journal: StudyOperation[] = [];
    refreshJournals.set(key, journal);
    const task = this.refreshData(journal);
    refreshing = { key, promise: task };
    try { await task; }
    catch (error) { if (generation === token) publish({ error: error instanceof Error ? error.message : "Study data is temporarily unavailable. Try again." }); throw error; }
    finally { if (refreshing?.promise === task) { refreshing = null; publish({ refreshing: false }); } if (refreshJournals.get(key) === journal) refreshJournals.delete(key); }
  },
  async refreshData(journal: StudyOperation[]) {
    const key = scope; const token = generation;
    if (!key) throw new Error("Sign in before downloading the question bank.");
    await this.sync();
    if (generation !== token) return;
    const profileRevision = (await read(key))?.profileRevision;
    if (generation !== token) return;
    const response = await fetch("/api/study/snapshot", { cache: "no-store" });
    if (generation !== token) return;
    if (response.status === 401 || response.status === 403) { await accountChanged(key); throw new Error("Sign in online to refresh your study access. Your saved work is kept for this account."); }
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not refresh study data.");
    const remote = await response.json() as StudySnapshot & { download?: { questionIds: string[] } };
    if (generation !== token) return;
    if (keyFor(remote) !== key) { await accountChanged(keyFor(remote)); throw new Error("Account changed."); }
    if (remote.download) {
      const expected = new Set(remote.download.questionIds);
      await Promise.all((["questions", "attempts", "notes"] as const).map(async (kind) => {
        let cursor: string | null = null;
        const seen = new Set<string>();
        do {
          if (generation !== token) throw new Error("The signed-in account changed during download.");
          const response: Response = await fetch(`/api/study/download?kind=${kind}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
          const page: DownloadPage = await response.json();
          if (generation !== token) throw new Error("The signed-in account changed during download.");
          if (response.status === 401 || response.status === 403) { await accountChanged(key); throw new Error("Sign in online to refresh your study access. Your saved work is kept for this account."); }
          if (!response.ok) throw new Error(page.error);
          if (keyFor(page) !== key) { await accountChanged(keyFor(page)); throw new Error("Your account or exam changed during download. No partial data was saved."); }
          if (kind === "questions") remote.questions.push(...(page.questions ?? []));
          if (kind === "attempts") remote.attempts.push(...(page.attempts ?? []));
          if (kind === "notes") Object.assign(remote.notes, page.notes ?? {});
          cursor = page.next;
          if (cursor && seen.has(cursor)) throw new Error("The download stopped advancing. Try again.");
          if (cursor) seen.add(cursor);
        } while (cursor);
      }));
      const received = new Set(remote.questions.map((q) => q.id));
      if (received.size !== remote.questions.length || received.size !== expected.size || [...expected].some((id) => !received.has(id))) throw new Error("The question bank changed during download. Refresh again; your previous saved bank is kept.");
      remote.attempts = remote.attempts.filter((a) => received.has(a.questionId));
      delete remote.download;
    }
    await locked(`study-data:${key}`, async () => {
      const local = await read(key);
      if (generation !== token) return;
      const next = mergeStudySnapshot(local, remote, journal);
      if (local && local.profileRevision !== profileRevision) next.profile = local.profile;
      await write(key, next, true); localStorage.setItem(MARKER, key);
      if (generation === token) publish({ snapshot: next, ready: true, error: null });
      channel?.postMessage(key);
    });
  },
  async commit(input: Omit<StudyOperation, "id" | "createdAt"> | StudyOperation): Promise<StudySnapshot> {
    const operation = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...input } as StudyOperation;
    if (operation.kind === "attempt") operation.createdAt = operation.attempt.createdAt;
    const next = await change((snapshot) => {
      if (!Number.isFinite(Date.parse(snapshot.validUntil)) || Date.parse(snapshot.validUntil) <= Date.now()) throw new Error("Reconnect to refresh your study access. Your saved work is kept.");
      return applyStudyOperation(snapshot, operation);
    });
    void this.sync(); return next;
  },
  async local(transform: (snapshot: StudySnapshot) => StudySnapshot) { return change(transform); },
  async updateProfile(userId: string, examId: string, updates: Partial<Pick<Profile, "name" | "medicalSchool" | "showShortcuts" | "explanationAutoScroll">>) {
    if (scope !== `${userId}:${examId}`) throw new Error("The signed-in account changed. Reload your profile.");
    if (!state.snapshot) { await this.refresh(); return; }
    await change((s) => ({ ...s, profile: { ...s.profile, ...updates }, profileRevision: crypto.randomUUID() }));
  },
  async resolveConflict(sessionId: string) {
    const key = scope; const token = generation;
    if (!key || !state.snapshot) throw new Error("Sign in before resolving this conflict.");
    await locked(`study-sync:${key}`, async () => {
      const response = await fetch(`/api/study/session/${encodeURIComponent(sessionId)}?resolve=1`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the online session. Your saved work is kept.");
      if (generation !== token || keyFor(data) !== key) throw new Error("The signed-in account or exam changed.");
      await change((s) => {
        if (data.session && data.session.id !== sessionId) throw new Error("The online session did not match.");
        return resolveSessionConflict(data.removedAt ? { ...s, deletedSessions: { ...s.deletedSessions, [sessionId]: data.removedAt } } : s, sessionId, data.session, data.attempts);
      });
      publish({ error: null });
    });
    await this.sync();
  },
  async loadSession(id: string) {
    if (state.snapshot && isSessionRemoved(state.snapshot, id)) throw new Error("This session was removed. Your answers are kept.");
    const token = generation;
    const response = await fetch(`/api/study/session/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (generation !== token || data.userId !== state.snapshot?.userId) throw new Error("The account changed.");
    await change((s) => {
      if (isSessionRemoved(s, id)) throw new Error("This session was removed. Your answers are kept.");
      if (!data.session.questionIds.every((id: string) => s.questions.some((q) => q.id === id))) throw new Error("This session contains unavailable questions.");
      return { ...s, sessions: { ...s.sessions, [id]: s.sessions[id] ?? data.session }, attempts: [...s.attempts.filter((a) => a.sessionId !== id), ...data.attempts] };
    });
  },
  async plan(plan?: StudyPlan) { if (plan) validateStudyPlan(plan); await change((snapshot) => ({ ...snapshot, plan })); },
  async sync() {
    if (syncing) return syncing;
    if (!scope || !state.snapshot || state.snapshot.demo || !navigator.onLine) return;
    const key = scope; const token = generation;
    syncing = locked(`study-sync:${key}`, async () => {
      publish({ syncing: true, error: null });
      try {
        for (;;) {
          const latest = await read(key); const operation = latest ? nextSyncOperation(latest) : undefined;
          if (!latest || !operation || generation !== token || !navigator.onLine) break;
          const response = await fetch("/api/study/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: latest.userId, examId: latest.examId, operation }) });
          if (generation !== token) break;
          if (!response.ok) {
            const result = await response.json();
            if (response.status === 409 && result.code === "study_conflict" && operationSessionId(operation)) {
              await change((s) => ({ ...s, conflicts: { ...s.conflicts, [operation.id]: result.error ?? "This session changed online." } }));
              continue;
            }
            throw new Error(result.error ?? "Sync needs attention. Your work is saved on this device.");
          }
          refreshJournals.get(key)?.push(operation);
          await change((snapshot) => ({ ...snapshot, outbox: snapshot.outbox.filter((op) => op.id !== operation.id) }));
        }
      } catch (error) { if (generation === token) publish({ error: error instanceof Error ? error.message : "Waiting for a connection. Your work is saved on this device." }); }
      finally { if (generation === token) publish({ syncing: false }); }
    }).finally(() => { syncing = null; });
    return syncing;
  },
  async downloadFigures() {
    const snapshot = state.snapshot; const token = generation;
    if (!snapshot) throw new Error("Download study data first.");
    if (!("caches" in window)) throw new Error("This browser cannot save clinical figures offline.");
    const urls = [...new Set(snapshot.questions.flatMap((q) => q.figureUrls?.length ? q.figureUrls : q.figureUrl ? [q.figureUrl] : []))];
    const cache = await caches.open(`montreal-figures:${keyFor(snapshot)}`);
    let saved = 0;
    publish({ figures: { saved, total: urls.length } });
    for (const url of urls) {
      if (generation !== token) return;
      try {
        const existing = await cache.match(url);
        if (existing) saved++;
        else { const response = await fetch(url, { credentials: "same-origin" }); if (response.ok && response.headers.get("content-type")?.startsWith("image/")) { await cache.put(url, response); saved++; } }
      } catch { /* Retain saved figures; the next download retries missing images. */ }
      publish({ figures: { saved, total: urls.length } });
    }
    if (saved !== urls.length) throw new Error(`${saved} of ${urls.length} figures saved. Reconnect and download again for the remaining figures.`);
  },
  async clear(discard = false) {
    if (!discard && state.snapshot?.outbox.length) throw new Error("Sync your saved work or resolve its conflicts in Offline study settings before signing out.");
    const key = scope;
    generation++; scope = null; publish({ snapshot: null, ready: true, error: null });
    const db = await database();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction("records", "readwrite"); const records = tx.objectStore("records"); if (key) { records.delete(key); records.delete(`bank:${key}`); } records.delete("__active"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    localStorage.removeItem(MARKER);
    if ("caches" in window && key) await caches.delete(`montreal-figures:${key}`);
    channel?.postMessage("clear");
  },
};

export type StudyInput = StudyOperation extends infer O ? O extends StudyOperation ? Omit<O, "id" | "createdAt"> : never : never;
export async function saveStudy(input: StudyInput) { return studyStore.commit(input); }
