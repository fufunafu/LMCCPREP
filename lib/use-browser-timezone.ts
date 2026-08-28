"use client";

import { useSyncExternalStore } from "react";

const FALLBACK = "America/Toronto";
const subscribe = () => () => {};
const getSnapshot = () => Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK;
const getServerSnapshot = () => FALLBACK;

/** The viewer's IANA timezone; Toronto during SSR so hydration stays consistent. */
export function useBrowserTimeZone() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
