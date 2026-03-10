import { DateTime } from "luxon";
import type { TrackingStatus } from "@/types";
import { STALENESS_THRESHOLD_MINUTES } from "@/lib/time";

export const TRACKING_LIVE_THRESHOLD_MINUTES = STALENESS_THRESHOLD_MINUTES;
export const TRACKING_STALE_THRESHOLD_MINUTES = 60;

const TIMEZONE = "America/Bahia";

export function deriveTrackingStatus(
  lastGpsFixAt: string | null,
  now: DateTime,
): TrackingStatus {
  if (!lastGpsFixAt) return "missing";

  const fixTime = DateTime.fromISO(lastGpsFixAt).setZone(TIMEZONE);
  const ageMinutes = now.setZone(TIMEZONE).diff(fixTime, "minutes").minutes;

  if (ageMinutes < 0 || ageMinutes >= TRACKING_STALE_THRESHOLD_MINUTES) {
    return "missing";
  }

  if (ageMinutes < TRACKING_LIVE_THRESHOLD_MINUTES) {
    return "live";
  }

  return "stale";
}
