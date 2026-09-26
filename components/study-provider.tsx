"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { studyStore } from "@/lib/study-store";

export function useStudy() { return useSyncExternalStore(studyStore.subscribe, studyStore.getSnapshot, studyStore.getServerSnapshot); }
export function useStudyTime() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now;
}
export function StudyProvider({ userId, examId, children }: { userId?: string; examId?: string; children: React.ReactNode }) {
  useEffect(() => {
    void studyStore.open(userId, examId);
    const reconnect = () => { void studyStore.refresh().catch(() => undefined); };
    window.addEventListener("online", reconnect);
    const navigate = (event: MouseEvent) => {
      if (navigator.onLine && location.pathname !== "/offline") return;
      const link = (event.target as HTMLElement)?.closest("a");
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || link.target === "_blank") return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || !/^\/(dashboard|create|session|stats|questions|settings)(\/|$)/.test(url.pathname)) return;
      event.preventDefault(); event.stopPropagation();
      if (location.pathname === "/offline") location.hash = url.pathname + url.search;
      // A document navigation lets the service worker supply the saved shell without an RSC request.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      else location.assign(`/offline#${url.pathname}${url.search}`);
    };
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("online", reconnect); document.removeEventListener("click", navigate, true); };
  }, [userId, examId]);
  return children;
}
