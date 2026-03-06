import { DateTime } from "luxon";
import { parseTime, STALENESS_THRESHOLD_MINUTES } from "@/lib/time";
import { haversineDistanceMeters } from "@/lib/tracking/haversine";
import { osrmRoute } from "@/lib/tracking/osrm";
import { getTimeFactor, type RecentRun } from "@/lib/tracking/time-factors";

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
  etaSource: "gps" | "gps_osrm" | "schedule" | null;
}

export const ROAD_FACTOR = 1.3;
export const MIN_SPEED_MPS = 1.0;
export const PROXIMITY_THRESHOLD_M = 500;
export const FALLBACK_SPEED_MPS = 4.2;

export function computeSmoothedSpeed(recentSpeeds: number[]): number {
  const nonZero = recentSpeeds.filter((s) => s > 0);
  if (nonZero.length === 0) return 0;
  return nonZero.reduce((sum, s) => sum + s, 0) / nonZero.length;
}

export async function computeEta(args: {
  stops: Stop[];
  now: DateTime;
  vanPosition?: VanPosition | null;
  startedAt?: string | null;
  osrmBaseUrl?: string;
  routeId?: string;
  recentRuns?: RecentRun[];
  recentSpeeds?: number[];
}): Promise<EtaResult> {
  const { stops, now, vanPosition, startedAt, osrmBaseUrl, routeId, recentRuns } = args;

  const passed = stops.filter((s) => s.status === "passed");
  const pending = stops.filter((s) => s.status === "pending");
  const passedStopIds = passed.map((s) => s.scheduleEntryId);

  // Time floor: started_at (explicit) > now (fallback)
  const timeFloor = startedAt
    ? DateTime.fromISO(startedAt).setZone(now.zone).toFormat("HH:mm")
    : now.toFormat("HH:mm");
  const futurePending = pending.filter((s) => s.time >= timeFloor);

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
  const locationAgeMinutes = vanPosition
    ? now.diff(vanPosition.locationUpdatedAt, "minutes").minutes
    : Infinity;
  const hasCoords = vanPosition != null && nextStop.stopLat != null && nextStop.stopLng != null;
  const locationFresh = locationAgeMinutes >= 0 && locationAgeMinutes < STALENESS_THRESHOLD_MINUTES;
  const isMoving = vanPosition != null && vanPosition.speedMps >= MIN_SPEED_MPS;
  const isNearStop = hasCoords && vanPosition != null
    ? haversineDistanceMeters(vanPosition.lat, vanPosition.lng, nextStop.stopLat!, nextStop.stopLng!) <= PROXIMITY_THRESHOLD_M
    : false;

  const gpsConditionsMet = hasCoords && locationFresh && (isMoving || isNearStop);

  if (gpsConditionsMet) {
    let distanceMeters: number;
    let etaSource: "gps" | "gps_osrm" = "gps";

    const osrmResult = osrmBaseUrl
      ? await osrmRoute(
          vanPosition.lat,
          vanPosition.lng,
          nextStop.stopLat!,
          nextStop.stopLng!,
          osrmBaseUrl,
        )
      : null;

    if (osrmResult) {
      distanceMeters = osrmResult.distanceMeters;
      etaSource = "gps_osrm";
    } else {
      distanceMeters =
        haversineDistanceMeters(
          vanPosition.lat,
          vanPosition.lng,
          nextStop.stopLat!,
          nextStop.stopLng!,
        ) * ROAD_FACTOR;
    }

    let effectiveSpeed: number;
    if (vanPosition.speedMps < MIN_SPEED_MPS) {
      effectiveSpeed = FALLBACK_SPEED_MPS;
    } else if (args.recentSpeeds && args.recentSpeeds.length > 0) {
      const smoothed = computeSmoothedSpeed(args.recentSpeeds);
      effectiveSpeed = smoothed >= MIN_SPEED_MPS ? smoothed : vanPosition.speedMps;
    } else {
      effectiveSpeed = vanPosition.speedMps;
    }

    let baseTravelMinutes: number;
    if (osrmResult) {
      baseTravelMinutes = osrmResult.durationSeconds / 60;
    } else {
      baseTravelMinutes = distanceMeters / effectiveSpeed / 60;
    }
    const timeFactor = getTimeFactor(now.hour, now.weekday, routeId, recentRuns);
    const travelMinutes = baseTravelMinutes * timeFactor;

    const haversineDistance = haversineDistanceMeters(
      vanPosition.lat, vanPosition.lng,
      nextStop.stopLat!, nextStop.stopLng!,
    );
    const haversineTravelMin = (haversineDistance * ROAD_FACTOR) / effectiveSpeed / 60;

    console.log(JSON.stringify({
      event: "eta_comparison",
      routeId,
      stopId: nextStop.scheduleEntryId,
      haversine: { distanceM: haversineDistance * ROAD_FACTOR, travelMinutes: haversineTravelMin },
      osrm: osrmResult ? { distanceM: osrmResult.distanceMeters, durationS: osrmResult.durationSeconds } : null,
      baseTravelSource: osrmResult ? "osrm_duration" : "distance_speed",
      timeFactor,
      finalTravelMinutes: travelMinutes,
      gpsSpeedMps: vanPosition.speedMps,
      chosen: etaSource,
      timestamp: now.toISO(),
    }));

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
      etaSource,
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

interface ScheduleEntry {
  id: string;
  stop_name: string;
  time: string;
  stop_lat: number | null;
  stop_lng: number | null;
}

interface ResolvedNextStop {
  nextStop: { stopName: string; time: string };
  currentStopIndex: number;
  nextStopEntry: ScheduleEntry;
}

/**
 * When tracking is active, resolve the next stop from progress.nextStopId
 * instead of the time-based getNextStop result.
 */
export function resolveNextStop(
  sortedEntries: ScheduleEntry[],
  nextStopId: string,
  formatTime: (t: string) => string,
): ResolvedNextStop | null {
  const trackedEntry = sortedEntries.find((e) => e.id === nextStopId);
  if (!trackedEntry) return null;
  return {
    nextStop: {
      stopName: trackedEntry.stop_name,
      time: formatTime(trackedEntry.time),
    },
    currentStopIndex: sortedEntries.indexOf(trackedEntry),
    nextStopEntry: trackedEntry,
  };
}
