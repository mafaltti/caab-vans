import { DateTime } from "luxon";
import { parseTime, STALENESS_THRESHOLD_MINUTES } from "@/lib/time";
import { chooseEffectivePosition } from "@/lib/tracking/effective-position";
import { computeBearing, haversineDistanceMeters } from "@/lib/tracking/haversine";
import { SNAP_DISPLACEMENT_THRESHOLD_M } from "@/lib/tracking/infer-stop-progress";
import { osrmRoute } from "@/lib/tracking/osrm";
import { getTimeFactor, REFERENCE_SPEED_MPS, type RecentRun } from "@/lib/tracking/time-factors";

interface Stop {
  scheduleEntryId: string;
  stopSequence: number;
  arrivalTime: string; // HH:mm
  departureTime: string; // HH:mm
  status: "pending" | "passed";
  passedAt: string | null;
  stopLat?: number | null;
  stopLng?: number | null;
  osrmDistanceM?: number | null;
}

export interface VanPosition {
  lat: number;
  lng: number;
  snappedLat?: number | null;
  snappedLng?: number | null;
  speedMps: number;
  lastGpsFixAt: DateTime;
  headingDeg?: number | null;
}

interface EtaResult {
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  nextStopId: string | null;
  passedStopIds: string[];
  etaSource: "gps" | "gps_osrm" | "segment" | "schedule" | null;
  etaStatus: "estimated" | "overdue" | "none";
}

export const ROAD_FACTOR = 1.3;
export const MIN_SPEED_MPS = 1.0;
export const PROXIMITY_THRESHOLD_M = 500;
// ~15 km/h — urban crawling speed estimate, used when van is stationary but GPS branch is active (proximity or hysteresis grace period)
export const FALLBACK_SPEED_MPS = 4.2;
export const HYSTERESIS_WINDOW_S = 60;
export const DIRECTION_THRESHOLD_DEG = 90;

export function computeSmoothedSpeed(recentSpeeds: number[]): number {
  const nonZero = recentSpeeds.filter((s) => s > 0);
  if (nonZero.length === 0) return 0;
  const sorted = [...nonZero].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function computeEta(args: {
  stops: Stop[];
  now: DateTime;
  vanPosition?: VanPosition | null;
  startedAt?: string | null;
  osrmBaseUrl?: string;
  routeId?: string;
  recentRuns?: RecentRun[];
  recentSpeeds?: Array<{ speedMps: number; deviceTs: string }>;
  targetStopId?: string;
}): Promise<EtaResult> {
  const { stops, now, vanPosition, startedAt, osrmBaseUrl, routeId, recentRuns, targetStopId } = args;

  const passed = stops.filter((s) => s.status === "passed");
  const pending = stops.filter((s) => s.status === "pending");
  const passedStopIds = passed.map((s) => s.scheduleEntryId);

  // Target stop resolution: when targetStopId is provided, bypass time-floor filtering
  let nextStop: Stop;
  let nextStopId: string;

  if (targetStopId) {
    const target = pending.find((s) => s.scheduleEntryId === targetStopId);
    if (!target) {
      return { etaNextStopISO: null, etaNextStopMinutes: null, delayMinutes: null, nextStopId: null, passedStopIds, etaSource: null, etaStatus: "none" };
    }
    nextStop = target;
    nextStopId = target.scheduleEntryId;
  } else {
    // Time floor: started_at (explicit) > now (fallback)
    const timeFloor = startedAt
      ? DateTime.fromISO(startedAt).setZone(now.zone).toFormat("HH:mm")
      : now.toFormat("HH:mm");
    const futurePending = pending.filter((s) => (s.departureTime) >= timeFloor);

    let selectedPending: Stop[];
    if (futurePending.length > 0) {
      selectedPending = futurePending;
    } else if (pending.length > 0) {
      // Route-order fallback: all stops overdue, use first pending by schedule order
      selectedPending = pending;
    } else {
      return {
        etaNextStopISO: null,
        etaNextStopMinutes: null,
        delayMinutes: null,
        nextStopId: null,
        passedStopIds,
        etaSource: null,
        etaStatus: "none",
      };
    }

    const sortedPending = [...selectedPending].sort((a, b) =>
      (a.stopSequence ?? 0) - (b.stopSequence ?? 0),
    );
    nextStop = sortedPending[0];
    nextStopId = nextStop.scheduleEntryId;
  }

  // GPS branch: use distance/speed when all conditions are met
  const locationAgeMinutes = vanPosition
    ? now.diff(vanPosition.lastGpsFixAt, "minutes").minutes
    : Infinity;
  const hasCoords = vanPosition != null && nextStop.stopLat != null && nextStop.stopLng != null;
  const locationFresh = locationAgeMinutes >= 0 && locationAgeMinutes < STALENESS_THRESHOLD_MINUTES;
  const isMoving = vanPosition != null && vanPosition.speedMps >= MIN_SPEED_MPS;

  const effectivePos = hasCoords && vanPosition != null
    ? chooseEffectivePosition({
        rawLat: vanPosition.lat,
        rawLng: vanPosition.lng,
        snappedLat: vanPosition.snappedLat,
        snappedLng: vanPosition.snappedLng,
        targetLat: nextStop.stopLat!,
        targetLng: nextStop.stopLng!,
        snapDisplacementThreshold: SNAP_DISPLACEMENT_THRESHOLD_M,
      })
    : null;

  const isNearStop = effectivePos != null
    ? haversineDistanceMeters(effectivePos.lat, effectivePos.lng, nextStop.stopLat!, nextStop.stopLng!) <= PROXIMITY_THRESHOLD_M
    : false;

  // Hysteresis: check if any recent ping within the last 60s had speed >= MIN_SPEED_MPS
  const nowMs = now.toMillis();
  const recentlyMoving = args.recentSpeeds
    ? args.recentSpeeds.some((p) => {
        const pingMs = DateTime.fromISO(p.deviceTs).toMillis();
        const ageSeconds = (nowMs - pingMs) / 1000;
        return ageSeconds >= 0 && ageSeconds <= HYSTERESIS_WINDOW_S && p.speedMps >= MIN_SPEED_MPS;
      })
    : false;

  const gpsConditionsMet = hasCoords && locationFresh && (isMoving || isNearStop || recentlyMoving);

  if (gpsConditionsMet) {
    let etaSource: "gps" | "gps_osrm" = "gps";

    const osrmResult = osrmBaseUrl
      ? await osrmRoute(
          effectivePos!.lat,
          effectivePos!.lng,
          nextStop.stopLat!,
          nextStop.stopLng!,
          osrmBaseUrl,
        )
      : null;

    if (osrmResult) {
      etaSource = "gps_osrm";
    } else {
      // Direction detection: if van is heading away from stop, fall through to schedule
      // Only check when moving — at low speed, headingDeg is often stale
      if (vanPosition.headingDeg != null && isMoving) {
        const bearingToStop = computeBearing(
          effectivePos!.lat, effectivePos!.lng,
          nextStop.stopLat!, nextStop.stopLng!,
        );
        const diff = Math.abs(vanPosition.headingDeg - bearingToStop);
        const angularDiff = Math.min(diff, 360 - diff);
        if (angularDiff > DIRECTION_THRESHOLD_DEG) {
          // Van is heading away from stop — skip GPS branch
          return scheduleDelayFallback(stops, passed, nextStop, nextStopId, passedStopIds, now);
        }
      }
    }

    let effectiveSpeed: number;
    if (vanPosition.speedMps < MIN_SPEED_MPS) {
      // Stationary but GPS branch active via proximity or hysteresis
      effectiveSpeed = FALLBACK_SPEED_MPS;
    } else if (args.recentSpeeds && args.recentSpeeds.length > 0) {
      const smoothed = computeSmoothedSpeed(args.recentSpeeds.map((p) => p.speedMps));
      effectiveSpeed = smoothed >= MIN_SPEED_MPS ? smoothed : vanPosition.speedMps;
    } else {
      effectiveSpeed = vanPosition.speedMps;
    }

    let baseTravelMinutes: number;
    if (osrmResult) {
      baseTravelMinutes = osrmResult.durationSeconds / 60;
    } else {
      const distanceMeters =
        haversineDistanceMeters(
          effectivePos!.lat,
          effectivePos!.lng,
          nextStop.stopLat!,
          nextStop.stopLng!,
        ) * ROAD_FACTOR;
      baseTravelMinutes = distanceMeters / effectiveSpeed / 60;
    }
    const timeFactor = getTimeFactor(now.hour, now.weekday, routeId, recentRuns);
    const travelMinutes = baseTravelMinutes * timeFactor;

    if (process.env.DEBUG_ETA) {
      const haversineDistance = haversineDistanceMeters(
        effectivePos!.lat, effectivePos!.lng,
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
    }

    const etaDateTime = now.plus({ minutes: travelMinutes });
    const etaNextStopMinutes = Math.max(
      0,
      Math.ceil(etaDateTime.diff(now, "minutes").minutes),
    );

    // Still compute schedule delay for informational purposes
    const sortedPassed = [...passed].sort((a, b) =>
      (a.stopSequence ?? 0) - (b.stopSequence ?? 0),
    );
    const lastPassed = sortedPassed.length > 0 ? sortedPassed.at(-1)! : null;
    const delay = lastPassed
      ? DateTime.fromISO(lastPassed.passedAt!).diff(
          parseTime(lastPassed.arrivalTime),
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
      etaStatus: "estimated",
    };
  }

  // Segment-aware fallback: use stored OSRM distance when GPS is unavailable.
  // Sum osrmDistanceM across all intermediate stops between last-passed and target.
  const sortedAllForSegment = [...stops].sort((a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0));
  const sortedPassedForSegment = sortedAllForSegment.filter((s) => s.status === "passed");
  const lastPassedForSegment = sortedPassedForSegment.length > 0 ? sortedPassedForSegment.at(-1)! : null;

  if (lastPassedForSegment?.passedAt) {
    const lastPassedIdx = sortedAllForSegment.findIndex(
      (s) => s.scheduleEntryId === lastPassedForSegment.scheduleEntryId,
    );
    const nextStopIdx = sortedAllForSegment.findIndex(
      (s) => s.scheduleEntryId === nextStopId,
    );

    if (lastPassedIdx !== -1 && nextStopIdx !== -1 && nextStopIdx > lastPassedIdx) {
      let accumulatedDistance = 0;
      let allSegmentsPresent = true;

      for (let i = lastPassedIdx; i < nextStopIdx; i++) {
        if (sortedAllForSegment[i].osrmDistanceM == null) {
          allSegmentsPresent = false;
          break;
        }
        accumulatedDistance += sortedAllForSegment[i].osrmDistanceM!;
      }

      if (allSegmentsPresent && accumulatedDistance > 0) {
        const timeFactor = getTimeFactor(now.hour, now.weekday, routeId, recentRuns);
        const travelMinutes = (accumulatedDistance / REFERENCE_SPEED_MPS / 60) * timeFactor;
        const etaDateTime = DateTime.fromISO(lastPassedForSegment.passedAt).setZone(now.zone).plus({ minutes: travelMinutes });

        const delay = DateTime.fromISO(lastPassedForSegment.passedAt).diff(parseTime(lastPassedForSegment.arrivalTime), "minutes").minutes;

        const scheduledTime = (() => {
          const [h, m] = (nextStop.arrivalTime).split(":").map(Number);
          return now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
        })();
        if (etaDateTime <= now && scheduledTime <= now) {
          return {
            etaNextStopISO: etaDateTime.toISO(),
            etaNextStopMinutes: null,
            delayMinutes: delay != null ? Math.round(delay) : null,
            nextStopId,
            passedStopIds,
            etaSource: "segment",
            etaStatus: "overdue",
          };
        }

        const etaNextStopMinutes = Math.max(0, Math.ceil(etaDateTime.diff(now, "minutes").minutes));

        return {
          etaNextStopISO: etaDateTime.toISO(),
          etaNextStopMinutes,
          delayMinutes: delay != null ? Math.round(delay) : null,
          nextStopId,
          passedStopIds,
          etaSource: "segment",
          etaStatus: "estimated",
        };
      }
    }
  }

  return scheduleDelayFallback(stops, passed, nextStop, nextStopId, passedStopIds, now);
}

function scheduleDelayFallback(
  _stops: Stop[],
  passed: Stop[],
  nextStop: Stop,
  nextStopId: string,
  passedStopIds: string[],
  now: DateTime,
): EtaResult {
  const sortedPassed = [...passed].sort((a, b) =>
    (a.stopSequence ?? 0) - (b.stopSequence ?? 0),
  );
  const lastPassed = sortedPassed.length > 0 ? sortedPassed.at(-1)! : null;

  let delay: number | null = null;
  let etaDateTime: DateTime;

  if (!lastPassed) {
    etaDateTime = parseTime(nextStop.arrivalTime);
  } else {
    delay = DateTime.fromISO(lastPassed.passedAt!)
      .diff(parseTime(lastPassed.arrivalTime), "minutes").minutes;
    etaDateTime = parseTime(nextStop.arrivalTime).plus({ minutes: delay });
  }

  const scheduledTime = (() => {
    const [h, m] = (nextStop.arrivalTime).split(":").map(Number);
    return now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  })();
  if (etaDateTime <= now && scheduledTime <= now) {
    return {
      etaNextStopISO: etaDateTime.toISO(),
      etaNextStopMinutes: null,
      delayMinutes: delay != null ? Math.round(delay) : null,
      nextStopId,
      passedStopIds,
      etaSource: "schedule",
      etaStatus: "overdue",
    };
  }

  const etaNextStopMinutes = Math.max(0, Math.ceil(etaDateTime.diff(now, "minutes").minutes));

  return {
    etaNextStopISO: etaDateTime.toISO(),
    etaNextStopMinutes,
    delayMinutes: delay != null ? Math.round(delay) : null,
    nextStopId,
    passedStopIds,
    etaSource: "schedule",
    etaStatus: "estimated",
  };
}

interface ScheduleEntry {
  id: string;
  stop_name: string;
  arrival_time: string;
  departure_time: string;
  stop_sequence: number;
  stop_lat: number | null;
  stop_lng: number | null;
  osrm_distance_m?: number | null;
}

interface ResolvedNextStop {
  nextStop: { stopName: string; time: string; departureTime: string; stopSequence: number };
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
      time: formatTime(trackedEntry.arrival_time),
      departureTime: formatTime(trackedEntry.departure_time),
      stopSequence: trackedEntry.stop_sequence,
    },
    currentStopIndex: sortedEntries.indexOf(trackedEntry),
    nextStopEntry: trackedEntry,
  };
}
