import { DateTime } from "luxon";
import { parseTime, STALENESS_THRESHOLD_MINUTES } from "@/lib/time";
import { haversineDistanceMeters } from "@/lib/tracking/haversine";

interface Stop {
  scheduleEntryId: string;
  time: string; // HH:mm
  status: "pending" | "passed";
  passedAt: string | null;
  stopLat?: number | null;
  stopLng?: number | null;
}

export interface VanPosition {
  lat: number;
  lng: number;
  speedMps: number;
  locationUpdatedAt: DateTime;
}

interface EtaResult {
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  nextStopId: string | null;
  passedStopIds: string[];
  etaSource: "gps" | "schedule" | null;
}

export const ROAD_FACTOR = 1.3;
export const MIN_SPEED_MPS = 1.0;

export function computeEta(args: {
  stops: Stop[];
  now: DateTime;
  vanPosition?: VanPosition | null;
}): EtaResult {
  const { stops, now, vanPosition } = args;

  const passed = stops.filter((s) => s.status === "passed");
  const pending = stops.filter((s) => s.status === "pending");
  const passedStopIds = passed.map((s) => s.scheduleEntryId);

  // Filter pending stops to only those at or after the current time
  const nowHHmm = now.toFormat("HH:mm");
  const futurePending = pending.filter((s) => s.time >= nowHHmm);

  if (futurePending.length === 0) {
    return {
      etaNextStopISO: null,
      etaNextStopMinutes: null,
      delayMinutes: null,
      nextStopId: null,
      passedStopIds,
      etaSource: null,
    };
  }

  const sortedPending = [...futurePending].sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  const nextStop = sortedPending[0];
  const nextStopId = nextStop.scheduleEntryId;

  // GPS branch: use distance/speed when all conditions are met
  const gpsConditionsMet =
    vanPosition != null &&
    nextStop.stopLat != null &&
    nextStop.stopLng != null &&
    vanPosition.speedMps >= MIN_SPEED_MPS &&
    now.diff(vanPosition.locationUpdatedAt, "minutes").minutes <
      STALENESS_THRESHOLD_MINUTES;

  if (gpsConditionsMet) {
    const distanceMeters = haversineDistanceMeters(
      vanPosition.lat,
      vanPosition.lng,
      nextStop.stopLat!,
      nextStop.stopLng!,
    );
    const travelMinutes =
      (distanceMeters * ROAD_FACTOR) / vanPosition.speedMps / 60;
    const etaDateTime = now.plus({ minutes: travelMinutes });
    const etaNextStopMinutes = Math.max(
      0,
      Math.ceil(etaDateTime.diff(now, "minutes").minutes),
    );

    // Still compute schedule delay for informational purposes
    const sortedPassed = [...passed].sort((a, b) =>
      a.time.localeCompare(b.time),
    );
    const lastPassed = sortedPassed.length > 0 ? sortedPassed.at(-1)! : null;
    const delay = lastPassed
      ? DateTime.fromISO(lastPassed.passedAt!).diff(
          parseTime(lastPassed.time),
          "minutes",
        ).minutes
      : null;

    return {
      etaNextStopISO: etaDateTime.toISO(),
      etaNextStopMinutes,
      delayMinutes: delay != null ? Math.round(delay) : null,
      nextStopId,
      passedStopIds,
      etaSource: "gps",
    };
  }

  // Schedule-delay fallback
  const sortedPassed = [...passed].sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  const lastPassed = sortedPassed.length > 0 ? sortedPassed.at(-1)! : null;

  let delay: number | null = null;
  let etaDateTime: DateTime;

  if (!lastPassed) {
    etaDateTime = parseTime(nextStop.time);
  } else {
    delay = DateTime.fromISO(lastPassed.passedAt!)
      .diff(parseTime(lastPassed.time), "minutes").minutes;
    etaDateTime = parseTime(nextStop.time).plus({ minutes: delay });
  }

  const etaNextStopMinutes = Math.max(
    0,
    Math.ceil(etaDateTime.diff(now, "minutes").minutes),
  );

  return {
    etaNextStopISO: etaDateTime.toISO(),
    etaNextStopMinutes,
    delayMinutes: delay != null ? Math.round(delay) : null,
    nextStopId,
    passedStopIds,
    etaSource: "schedule",
  };
}
