/**
 * Turning numbers and dates into words.
 *
 * Small on purpose, but kept out of the components: the same call length is shown on History,
 * Session Detail and the end-of-call sheet, and it must not say "1m 3s" in one place and
 * "63 seconds" in another.
 */

import { MOODS, type Mood } from "@duke/core";

const MINUTE = 60;

/**
 * The app is written in English, so the dates it prints are formatted in English too.
 *
 * Passing `undefined` to the `toLocale*` calls below would mean *"use the viewer's device
 * locale"* — and a phone set to Vietnamese turned the History list's `Thu` into `Th 5` and
 * `9 Oct` into `8 thg 10`: words nobody wrote, in a language the app does not speak. A device's
 * settings should not rewrite the interface.
 *
 * `en-GB` specifically because it is the one that matches what this file documents: a 24-hour
 * clock (`21:40`) and the day before the month (`9 Oct`).
 */
export const DISPLAY_LOCALE = "en-GB";

/** "12s", "4m 05s", "1h 02m". The unit that matters comes first. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < MINUTE) return `${total}s`;

  const minutes = Math.floor(total / MINUTE);
  const rest = total % MINUTE;
  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, "0")}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "4:05" — the live timer on the call screen. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / MINUTE);
  const rest = total % MINUTE;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** "Today", "Yesterday", "Thu", or "9 Oct" once it is a week old. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.floor((startOfToday.getTime() - date.getTime()) / 86_400_000);

  if (days < 0) return date.toLocaleTimeString(DISPLAY_LOCALE, { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(DISPLAY_LOCALE, { weekday: "short" });
  return date.toLocaleDateString(DISPLAY_LOCALE, { day: "numeric", month: "short" });
}

/** "21:40" */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(DISPLAY_LOCALE, { hour: "2-digit", minute: "2-digit" });
}

/** The micro-label at the top of Home. */
export function greetingForHour(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "LATE NIGHT";
  if (hour < 12) return "GOOD MORNING";
  if (hour < 18) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

const MOOD_LABELS: Readonly<Record<Mood, string>> = {
  cheerful: "Cheerful",
  calm: "Calm",
  excited: "Excited",
  sad: "Sad",
  angry: "Angry",
  whisper: "Whispering",
  teasing: "Teasing",
  serious: "Serious",
  friendly: "Friendly",
  curious: "Curious",
  surprised: "Surprised",
  sympathetic: "Kind",
};

export function moodLabel(mood: string | null): string | null {
  if (mood === null) return null;
  return (MOODS as readonly string[]).includes(mood) ? MOOD_LABELS[mood as Mood] : mood;
}

/** "2 calls" / "1 call" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
