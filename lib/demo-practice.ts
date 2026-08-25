import type { Attempt, SessionMode } from "@/lib/types";

const PREFIX = "lmcc-demo-practice-v1";
const LAST_MODE_KEY = `${PREFIX}:last-mode`;

export type DemoPracticeState = {
  mode: SessionMode;
  currentQuestionId: string;
  attempts: Attempt[];
  flags: string[];
  notes: Record<string, string>;
};

function storageKey(mode: SessionMode) {
  return `${PREFIX}:${mode}`;
}

function isState(value: unknown): value is DemoPracticeState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DemoPracticeState>;
  return (state.mode === "tutor" || state.mode === "timed")
    && typeof state.currentQuestionId === "string"
    && Array.isArray(state.attempts)
    && Array.isArray(state.flags)
    && Boolean(state.notes && typeof state.notes === "object");
}

export function readDemoPractice(mode?: SessionMode): DemoPracticeState | null {
  if (typeof window === "undefined") return null;
  try {
    const selectedMode = mode ?? (window.localStorage.getItem(LAST_MODE_KEY) as SessionMode | null);
    if (selectedMode !== "tutor" && selectedMode !== "timed") return null;
    const raw = window.localStorage.getItem(storageKey(selectedMode));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDemoPractice(state: DemoPracticeState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(state.mode), JSON.stringify(state));
    window.localStorage.setItem(LAST_MODE_KEY, state.mode);
  } catch {
    // A private browser may disable storage. The in-memory demo still works.
  }
}

export function clearDemoPractice() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey("tutor"));
    window.localStorage.removeItem(storageKey("timed"));
    window.localStorage.removeItem(LAST_MODE_KEY);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}
