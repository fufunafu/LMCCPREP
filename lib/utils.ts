import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Default seconds per question for timed sessions (server, mock and player all share this). */
export const DEFAULT_SECONDS_PER_QUESTION = 90

/** Calendar date key (YYYY-MM-DD) for a moment in America/Toronto, the app's reporting timezone. */
export function torontoDateKey(date: Date | string | number = new Date()) {
  return new Date(date).toLocaleDateString("en-CA", { timeZone: "America/Toronto" })
}

/** Long-form date label (e.g. "August 26, 2026"); undefined for missing or unparseable values. */
export function dateLabel(value?: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(date)
}
