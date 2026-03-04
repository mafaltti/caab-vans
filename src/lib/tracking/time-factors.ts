import { readFileSync } from "fs";
import { join } from "path";

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

const DEFAULT_FACTORS: TimeFactorsFile = {
  global: {
    weekday: DEFAULT_WEEKDAY_FACTORS,
    saturday: DEFAULT_SATURDAY_FACTORS,
    sunday: {},
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

export interface RecentRun {
  actualMinutes: number;
  predictedMinutes: number;
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

  // Blend with recent runs when available
  if (recentRuns && recentRuns.length > 0) {
    const recent = computeRecentFactor(recentRuns);
    return 0.7 * historical + 0.3 * recent;
  }

  return historical;
}
