import { DateTime } from "luxon";

const TIMEZONE = "America/Bahia";

export function nowBahia(): DateTime {
  return DateTime.now().setZone(TIMEZONE);
}

export function todayBahiaDate(): string {
  return nowBahia().toFormat("yyyy-MM-dd");
}

export const STALENESS_THRESHOLD_MINUTES = 3;
export const EARLY_ARRIVAL_WINDOW_MINUTES = 30;
export const POINTER_STALENESS_MINUTES = 30;
export const POINTER_ABSOLUTE_CEILING_MINUTES = 120;

export function isLocationFresh(dt: DateTime): boolean {
  const now = nowBahia();
  const elapsed = now.diff(dt.setZone(TIMEZONE), "minutes").minutes;
  return elapsed >= 0 && elapsed < STALENESS_THRESHOLD_MINUTES;
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
  entries: {
    departure_time: string;
    arrival_time: string;
    stop_sequence: number;
  }[],
  now: DateTime,
): boolean {
  if (entries.length === 0) return false;
  const sorted = [...entries].sort(
    (a, b) => a.stop_sequence - b.stop_sequence,
  );
  const first = parseTime(sorted[0].departure_time);
  const last = parseTime(sorted[sorted.length - 1].arrival_time);
  return now >= first && now <= last;
}

export function getNextStop(
  entries: {
    stopName: string;
    time: string;
    departureTime: string;
    stopSequence: number;
  }[],
  now: DateTime,
): {
  stopName: string;
  time: string;
  departureTime: string;
  stopSequence: number;
} | null {
  const sorted = [...entries].sort(
    (a, b) => a.stopSequence - b.stopSequence,
  );
  for (const entry of sorted) {
    const entryTime = parseTime(entry.departureTime);
    if (entryTime >= now) {
      return entry;
    }
  }
  return null;
}
