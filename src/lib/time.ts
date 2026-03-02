import { DateTime } from "luxon";

const TIMEZONE = "America/Bahia";

export function nowBahia(): DateTime {
  return DateTime.now().setZone(TIMEZONE);
}

export function todayBahiaDate(): string {
  return nowBahia().toFormat("yyyy-MM-dd");
}

export const STALENESS_THRESHOLD_MINUTES = 10;
export const EARLY_ARRIVAL_WINDOW_MINUTES = 30;

export function isLocationFresh(dt: DateTime): boolean {
  const now = nowBahia();
  const elapsed = now.diff(dt.setZone(TIMEZONE), "minutes").minutes;
  return elapsed < STALENESS_THRESHOLD_MINUTES;
}

export function formatTime(dt: DateTime): string {
  return dt.setZone(TIMEZONE).toFormat("HH:mm");
}

export function formatTimeString(time: string): string {
  return time.slice(0, 5);
}

export function parseTime(hhMm: string): DateTime {
  const now = nowBahia();
  const [hours, minutes] = hhMm.split(":").map(Number);
  return now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
}

export function isWithinScheduleWindow(
  times: string[],
  now: DateTime,
): boolean {
  if (times.length === 0) return false;
  const sorted = [...times].sort();
  const first = parseTime(sorted[0]);
  const last = parseTime(sorted[sorted.length - 1]);
  return now >= first && now <= last;
}

export function getNextStop(
  entries: { stopName: string; time: string }[],
  now: DateTime,
): { stopName: string; time: string } | null {
  const sorted = [...entries].sort((a, b) => a.time.localeCompare(b.time));
  for (const entry of sorted) {
    const entryTime = parseTime(entry.time);
    if (entryTime >= now) {
      return entry;
    }
  }
  return null;
}
