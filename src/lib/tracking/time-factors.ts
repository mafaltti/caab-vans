import { readFileSync } from "fs";
import { join } from "path";
import { DateTime } from "luxon";
import { haversineDistanceMeters } from "@/lib/tracking/haversine";

type DayType = "weekday" | "saturday" | "sunday";
type HourFactors = Record<string, number>;

interface TimeFactorsFile {
  global: Record<DayType, HourFactors>;
  routes?: Record<string, Record<string, HourFactors>>;
}

const DEFAULT_WEEKDAY_FACTORS: HourFactors = {
  "6": 1.05,
  "7": 1.35,
  "8": 1.4,
  "9": 1.15,
  "16": 1.1,
  "17": 1.35,
  "18": 1.3,
  "19": 1.05,
};

const DEFAULT_SATURDAY_FACTORS: HourFactors = {
  "8": 1.05,
  "9": 1.1,
  "10": 1.05,
  "17": 1.05,
  "18": 1.05,
};

const DEFAULT_SUNDAY_FACTORS: HourFactors = {
  "7": 0.95,
  "8": 0.95,
  "9": 0.95,
  "16": 0.95,
  "17": 0.95,
  "18": 0.95,
};

const DEFAULT_FACTORS: TimeFactorsFile = {
  global: {
    weekday: DEFAULT_WEEKDAY_FACTORS,
    saturday: DEFAULT_SATURDAY_FACTORS,
    sunday: DEFAULT_SUNDAY_FACTORS,
  },
};

function getDayType(dayOfWeek: number): DayType {
  if (dayOfWeek >= 1 && dayOfWeek <= 5) return "weekday";
  if (dayOfWeek === 6) return "saturday";
  return "sunday";
}

export function loadFactors(): TimeFactorsFile {
  try {
    const filePath = join(process.cwd(), "data", "time-factors.json");
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as TimeFactorsFile;
  } catch {
    return DEFAULT_FACTORS;
  }
}

// Calibration constant for recentRuns baseline predictions. Changing this value
// will shift all recent-factor ratios and thus all in-flight ETAs — it is NOT
// neutral. The current value (~30 km/h) represents typical urban van speed.
// Stability guarantee: the value is constant across API calls, so timeFactor
// only changes when a new stop is actually passed.
export const REFERENCE_SPEED_MPS = 8.3;
export const MIN_SEGMENT_DIST_M = 100;
export const MIN_SEGMENT_TIME_MIN = 0.5;
export const MIN_BLEND_SEGMENTS = 3;

export interface RecentRun {
  actualMinutes: number;
  predictedMinutes: number;
}

export interface PassedStop {
  passedAt: string;
  stopLat: number | null;
  stopLng: number | null;
  scheduleEntryId?: string;
}

export function buildRecentRuns(
  passedStops: PassedStop[],
  roadFactor: number,
  osrmDistances?: Map<string, number>,
): RecentRun[] {
  const runs: RecentRun[] = [];
  for (let i = 0; i < passedStops.length - 1; i++) {
    const curr = passedStops[i];
    const next = passedStops[i + 1];
    if (curr.stopLat == null || curr.stopLng == null || next.stopLat == null || next.stopLng == null) continue;

    const osrmDist = curr.scheduleEntryId ? osrmDistances?.get(curr.scheduleEntryId) : undefined;
    const dist = osrmDist ?? haversineDistanceMeters(curr.stopLat, curr.stopLng, next.stopLat, next.stopLng);
    if (dist < MIN_SEGMENT_DIST_M) continue;

    const actualMinutes = DateTime.fromISO(next.passedAt).diff(DateTime.fromISO(curr.passedAt), "minutes").minutes;
    if (actualMinutes < MIN_SEGMENT_TIME_MIN) continue;

    const roadDist = osrmDist ?? dist * roadFactor;
    const predictedMinutes = roadDist / REFERENCE_SPEED_MPS / 60;
    if (predictedMinutes > 0) {
      runs.push({ actualMinutes, predictedMinutes });
    }
  }
  return runs;
}

export function computeRecentFactor(recentRuns: RecentRun[]): number {
  if (recentRuns.length === 0) return 1.0;

  const ratios = recentRuns
    .filter((r) => r.predictedMinutes > 0)
    .map((r) => r.actualMinutes / r.predictedMinutes);

  if (ratios.length === 0) return 1.0;

  const sorted = [...ratios].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function getTimeFactor(
  hour: number,
  dayOfWeek: number,
  routeId?: string,
  recentRuns?: RecentRun[],
): number {
  const factors = loadFactors();
  const dayType = getDayType(dayOfWeek);

  // Check per-route override first
  let historical: number;
  if (routeId && factors.routes?.[routeId]?.[dayType]?.[String(hour)] != null) {
    historical = factors.routes[routeId][dayType][String(hour)];
  } else {
    historical = factors.global[dayType]?.[String(hour)] ?? 1.0;
  }

  // Blend with recent runs when enough segments available
  if (recentRuns && recentRuns.length >= MIN_BLEND_SEGMENTS) {
    const recent = computeRecentFactor(recentRuns);
    return 0.7 * historical + 0.3 * recent;
  }

  return historical;
}
