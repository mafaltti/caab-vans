/**
 * Nightly script: compute time correction factors from historical route_run_stops.
 *
 * Analyses the last 30 days of passed stops, compares actual travel time
 * (passed_at deltas) against predicted travel time (haversine / GPS speed),
 * and writes aggregated correction factors to data/time-factors.json.
 *
 * Usage:
 *   npx tsx scripts/compute-time-factors.ts
 */

import { Pool } from "pg";
import { DateTime } from "luxon";
import { mkdirSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var is required");
  process.exit(1);
}

const OSRM_BASE_URL = process.env.OSRM_BASE_URL;

const TZ = "America/Bahia";
const OBSERVATION_DAYS = 30;
const MIN_OBSERVATIONS = 20;
const ROUTE_VARIANCE_THRESHOLD = 0.15; // 15%
const DEFAULT_SPEED_MPS = 8.33; // ~30 km/h fallback
const ROAD_FACTOR = 1.3; // haversine → road distance multiplier
const OSRM_TIMEOUT_MS = 500; // more generous than runtime (batch job)

// ---------------------------------------------------------------------------
// Haversine (inline, standalone script)
// ---------------------------------------------------------------------------

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// OSRM road distance (with haversine fallback)
// ---------------------------------------------------------------------------

async function osrmDistance(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<number | null> {
  if (!OSRM_BASE_URL) return null;
  const url = `${OSRM_BASE_URL}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false&annotations=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    return data.routes[0].distance as number;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function roadDistance(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<number> {
  const osrm = await osrmDistance(fromLat, fromLng, toLat, toLng);
  if (osrm != null) return osrm;
  return haversineMeters(fromLat, fromLng, toLat, toLng) * ROAD_FACTOR;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DayType = "weekday" | "saturday" | "sunday";
type HourFactors = Record<string, number>; // hour string → factor
type FactorOutput = {
  generatedAt: string;
  observationDays: number;
  minObservations: number;
  global: Record<DayType, HourFactors>;
  routes: Record<string, Record<DayType, HourFactors>>;
};

type Observation = {
  dayType: DayType;
  hour: number;
  routeId: string;
  factor: number;
};

// ---------------------------------------------------------------------------
// Day type helper
// ---------------------------------------------------------------------------

function getDayType(dt: DateTime): DayType {
  const wd = dt.weekday; // 1=Mon … 7=Sun
  if (wd <= 5) return "weekday";
  if (wd === 6) return "saturday";
  return "sunday";
}

// ---------------------------------------------------------------------------
// Median helper
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const cutoff = DateTime.now()
      .setZone(TZ)
      .minus({ days: OBSERVATION_DAYS })
      .toISO();

    console.log(`Distance source: ${OSRM_BASE_URL ? `OSRM (${OSRM_BASE_URL})` : "haversine × 1.3 (OSRM_BASE_URL not set)"}`);
    console.log(`Querying route_run_stops passed in the last ${OBSERVATION_DAYS} days (since ${cutoff})...`);

    // Fetch all passed stops with their coordinates, run info, and route
    const stopsResult = await pool.query<{
      run_id: string;
      schedule_entry_id: string;
      passed_at: string;
      stop_lat: number;
      stop_lng: number;
      time: string;
      route_id: string;
      van_id: string;
      service_date: string;
    }>(
      `SELECT
        rrs.run_id,
        rrs.schedule_entry_id,
        rrs.passed_at,
        se.stop_lat,
        se.stop_lng,
        se.time,
        rr.route_id,
        r.van_id,
        rr.service_date
      FROM route_run_stops rrs
      JOIN route_runs rr ON rr.id = rrs.run_id
      JOIN schedule_entries se ON se.id = rrs.schedule_entry_id
      JOIN routes r ON r.id = rr.route_id
      WHERE rrs.status = 'passed'
        AND rrs.passed_at >= $1
        AND se.stop_lat IS NOT NULL
        AND se.stop_lng IS NOT NULL
      ORDER BY rrs.run_id, rrs.passed_at`,
      [cutoff],
    );

    const rows = stopsResult.rows;
    console.log(`Found ${rows.length} passed stops.`);

    if (rows.length === 0) {
      console.log("No data to compute factors. Writing defaults.");
      writeOutput({
        generatedAt: DateTime.now().setZone(TZ).toISO()!,
        observationDays: OBSERVATION_DAYS,
        minObservations: MIN_OBSERVATIONS,
        global: { weekday: {}, saturday: {}, sunday: {} },
        routes: {},
      });
      return;
    }

    // Group stops by run_id
    const runStops = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = runStops.get(row.run_id) ?? [];
      list.push(row);
      runStops.set(row.run_id, list);
    }

    // Collect van_ids per run for speed lookup
    const runMeta = new Map<string, { vanId: string }>();
    for (const row of rows) {
      if (!runMeta.has(row.run_id)) {
        runMeta.set(row.run_id, { vanId: row.van_id });
      }
    }

    console.log(`Processing ${runStops.size} runs...`);

    const observations: Observation[] = [];

    for (const [runId, stops] of runStops) {
      if (stops.length < 2) continue;

      const meta = runMeta.get(runId)!;

      // Process consecutive stop pairs
      for (let i = 0; i < stops.length - 1; i++) {
        const from = stops[i];
        const to = stops[i + 1];

        const fromDt = DateTime.fromISO(from.passed_at, { zone: TZ });
        const toDt = DateTime.fromISO(to.passed_at, { zone: TZ });

        const actualSeconds = toDt.diff(fromDt, "seconds").seconds;
        if (actualSeconds <= 0 || actualSeconds > 7200) continue; // skip invalid or > 2h

        const roadDist = await roadDistance(
          from.stop_lat,
          from.stop_lng,
          to.stop_lat,
          to.stop_lng,
        );
        if (roadDist < 50) continue; // skip very short segments

        // Query average GPS speed for the van during this segment window
        const speedResult = await pool.query<{ avg_speed: number | null }>(
          `SELECT AVG(speed_mps) as avg_speed
           FROM van_location_pings
           WHERE van_id = $1
             AND device_ts >= $2
             AND device_ts <= $3
             AND speed_mps > 0`,
          [meta.vanId, from.passed_at, to.passed_at],
        );

        const avgSpeed = speedResult.rows[0]?.avg_speed ?? DEFAULT_SPEED_MPS;
        const speed = avgSpeed > 0 ? avgSpeed : DEFAULT_SPEED_MPS;

        const predictedSeconds = roadDist / speed;
        if (predictedSeconds <= 0) continue;

        const factor = actualSeconds / predictedSeconds;

        // Sanity check: skip extreme outliers
        if (factor < 0.1 || factor > 10) continue;

        const dayType = getDayType(fromDt);
        const hour = fromDt.hour;

        observations.push({
          dayType,
          hour,
          routeId: from.route_id,
          factor,
        });
      }
    }

    console.log(`Collected ${observations.length} observations.`);

    // Aggregate global factors by (dayType, hour)
    const globalBuckets = new Map<string, number[]>();
    for (const obs of observations) {
      const key = `${obs.dayType}:${obs.hour}`;
      const list = globalBuckets.get(key) ?? [];
      list.push(obs.factor);
      globalBuckets.set(key, list);
    }

    const globalFactors: Record<DayType, HourFactors> = {
      weekday: {},
      saturday: {},
      sunday: {},
    };

    for (const [key, values] of globalBuckets) {
      if (values.length < MIN_OBSERVATIONS) continue;
      const [dayType, hourStr] = key.split(":") as [DayType, string];
      globalFactors[dayType][hourStr] = Number(median(values).toFixed(2));
    }

    // Aggregate per-route factors
    const routeBuckets = new Map<string, Map<string, number[]>>();
    for (const obs of observations) {
      const routeMap = routeBuckets.get(obs.routeId) ?? new Map();
      const key = `${obs.dayType}:${obs.hour}`;
      const list = routeMap.get(key) ?? [];
      list.push(obs.factor);
      routeMap.set(key, list);
      routeBuckets.set(obs.routeId, routeMap);
    }

    const routeOverrides: Record<string, Record<DayType, HourFactors>> = {};

    for (const [routeId, buckets] of routeBuckets) {
      for (const [key, values] of buckets) {
        if (values.length < MIN_OBSERVATIONS) continue;
        const [dayType, hourStr] = key.split(":") as [DayType, string];
        const routeMedian = median(values);
        const globalValue = globalFactors[dayType]?.[hourStr];

        // Only override if route variance exceeds threshold
        if (
          globalValue !== undefined &&
          Math.abs(routeMedian - globalValue) / globalValue >
            ROUTE_VARIANCE_THRESHOLD
        ) {
          if (!routeOverrides[routeId]) {
            routeOverrides[routeId] = { weekday: {}, saturday: {}, sunday: {} };
          }
          routeOverrides[routeId][dayType][hourStr] = Number(
            routeMedian.toFixed(2),
          );
        }
      }
    }

    // Clean empty day types from route overrides
    for (const routeId of Object.keys(routeOverrides)) {
      const route = routeOverrides[routeId];
      const hasData = Object.values(route).some(
        (dt) => Object.keys(dt).length > 0,
      );
      if (!hasData) delete routeOverrides[routeId];
    }

    const output: FactorOutput = {
      generatedAt: DateTime.now().setZone(TZ).toISO()!,
      observationDays: OBSERVATION_DAYS,
      minObservations: MIN_OBSERVATIONS,
      global: globalFactors,
      routes: routeOverrides,
    };

    writeOutput(output);

    // Print summary
    const globalCount = Object.values(globalFactors).reduce(
      (sum, dt) => sum + Object.keys(dt).length,
      0,
    );
    console.log(`\nGlobal factors: ${globalCount} (dayType, hour) buckets`);
    console.log(`Route overrides: ${Object.keys(routeOverrides).length} route(s)`);
    console.log("Done!");
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeOutput(data: FactorOutput) {
  const outDir = join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "time-factors.json");
  const tmpPath = join(outDir, "time-factors.json.tmp");
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmpPath, outPath);
  console.log(`Wrote ${outPath}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
