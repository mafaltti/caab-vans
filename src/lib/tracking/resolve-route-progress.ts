import { DateTime } from "luxon";
import { SupabaseClient } from "@supabase/supabase-js";

import { POINTER_STALENESS_MINUTES } from "@/lib/time";
import { computeEta, ROAD_FACTOR, type VanPosition } from "@/lib/tracking/eta";
import { deriveRunStatus } from "@/lib/tracking/run-status";
import { buildRecentRuns } from "@/lib/tracking/time-factors";
import type { RunStatus } from "@/types";

export interface RouteProgress {
  serviceDate: string;
  runStatus: RunStatus;
  shiftStartedAt: string | null;
  nextStopId: string | null;
  passedStopIds: string[];
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  etaSource: "gps" | "gps_osrm" | "segment" | "schedule" | null;
}

interface ScheduleEntry {
  id: string;
  stop_name: string;
  time: string;
  stop_lat: number | null;
  stop_lng: number | null;
  osrm_distance_m?: number | null;
}

export async function resolveRouteProgress(args: {
  supabase: SupabaseClient;
  routeId: string;
  serviceDate: string;
  sortedEntries: ScheduleEntry[];
  vanId: string;
  vanPosition: VanPosition | null;
  now: DateTime;
  times: string[];
}): Promise<RouteProgress | null> {
  const { supabase, routeId, serviceDate, sortedEntries, vanId, vanPosition, now, times } = args;

  // 1. Fetch route_run for today
  const { data: runData } = await supabase
    .from("route_runs")
    .select("id, last_passed_stop_id, next_stop_id, progress_updated_at")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .single();

  if (!runData) return null;

  // 2. Fetch shifts and derive run status
  const { data: shifts } = await supabase
    .from("route_shifts")
    .select("id, started_at, ended_at")
    .eq("run_id", runData.id);

  const shiftsArr = shifts ?? [];
  const sorted = [...times].sort();
  const lastTime = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const isPastScheduleWindow = lastTime
    ? now.toFormat("HH:mm") > lastTime
    : false;
  const runStatus = deriveRunStatus(shiftsArr, isPastScheduleWindow);
  const activeShift = shiftsArr.find((s) => s.ended_at === null);

  // 3. Early return for completed and idle runs (FR-011)
  if (runStatus === "completed" || runStatus === "idle") {
    return {
      serviceDate,
      runStatus,
      shiftStartedAt: null,
      nextStopId: null,
      passedStopIds: [],
      etaNextStopISO: null,
      etaNextStopMinutes: null,
      delayMinutes: null,
      etaSource: null,
    };
  }

  // 4. Fetch route_run_stops
  const { data: runStops } = await supabase
    .from("route_run_stops")
    .select("schedule_entry_id, status, passed_at, schedule_entries!inner(time)")
    .eq("run_id", runData.id);

  if (!runStops || runStops.length === 0) {
    return {
      serviceDate,
      runStatus,
      shiftStartedAt: activeShift?.started_at ?? null,
      nextStopId: null,
      passedStopIds: [],
      etaNextStopISO: null,
      etaNextStopMinutes: null,
      delayMinutes: null,
      etaSource: null,
    };
  }

  // 5. Build recentSpeeds from van_location_pings
  const recentSpeeds: Array<{ speedMps: number; deviceTs: string }> = [];
  if (vanId) {
    const { data: recentPings } = await supabase
      .from("van_location_pings")
      .select("speed_mps, device_ts")
      .eq("van_id", vanId)
      .not("speed_mps", "is", null)
      .order("device_ts", { ascending: false })
      .limit(10);

    if (recentPings) {
      recentSpeeds.push(
        ...recentPings.map((p) => ({
          speedMps: p.speed_mps as number,
          deviceTs: p.device_ts as string,
        })),
      );
    }
  }

  // 6. Build recentRuns from today's passed stops
  const stopCoordsMap = new Map(
    sortedEntries.map((e) => [e.id, { stopLat: e.stop_lat, stopLng: e.stop_lng }]),
  );
  const passedStops = runStops
    .filter((rs) => rs.status === "passed" && rs.passed_at != null)
    .map((rs) => {
      const coords = stopCoordsMap.get(rs.schedule_entry_id);
      return {
        scheduleEntryId: rs.schedule_entry_id,
        passedAt: rs.passed_at!,
        stopLat: coords?.stopLat ?? null,
        stopLng: coords?.stopLng ?? null,
      };
    })
    .sort((a, b) => a.passedAt.localeCompare(b.passedAt));

  const osrmDistances = new Map<string, number>();
  for (const e of sortedEntries) {
    if (e.osrm_distance_m != null) {
      osrmDistances.set(e.id, e.osrm_distance_m);
    }
  }

  const recentRuns = buildRecentRuns(passedStops, ROAD_FACTOR, osrmDistances);

  // 7. Validate persisted pointer
  const entryIds = new Set(sortedEntries.map((e) => e.id));
  let targetStopId: string | undefined;

  if (runData.next_stop_id) {
    const pointerExists = entryIds.has(runData.next_stop_id);
    const pointerIsPending = runStops.some(
      (rs) => rs.schedule_entry_id === runData.next_stop_id && rs.status === "pending",
    );
    const pointerAge = runData.progress_updated_at
      ? now.diff(DateTime.fromISO(runData.progress_updated_at), "minutes").minutes
      : Infinity;
    const pointerFresh = pointerAge < POINTER_STALENESS_MINUTES;

    if (pointerExists && pointerIsPending && pointerFresh) {
      targetStopId = runData.next_stop_id;
    }
  }

  // 8. Read progress source mode
  const mode = parseProgressSource(process.env.TRACKING_PROGRESS_SOURCE);

  // 9. Compute ETA based on mode
  const stops = runStops.map((rs) => {
    const coords = stopCoordsMap.get(rs.schedule_entry_id);
    return {
      scheduleEntryId: rs.schedule_entry_id,
      time: (rs.schedule_entries as unknown as { time: string }).time,
      status: rs.status as "pending" | "passed",
      passedAt: rs.passed_at,
      stopLat: coords?.stopLat ?? null,
      stopLng: coords?.stopLng ?? null,
      osrmDistanceM: osrmDistances.get(rs.schedule_entry_id) ?? null,
    };
  });

  const etaArgs = {
    stops,
    now,
    vanPosition,
    startedAt: activeShift?.started_at,
    osrmBaseUrl: process.env.OSRM_BASE_URL,
    routeId,
    recentRuns,
    recentSpeeds,
  };

  let etaResult;

  if (mode === "shadow") {
    // Compute both legacy and persisted, serve legacy, log mismatches
    const legacyResult = await computeEta(etaArgs);
    const persistedResult = targetStopId
      ? await computeEta({ ...etaArgs, targetStopId })
      : legacyResult;

    if (legacyResult.nextStopId !== persistedResult.nextStopId) {
      console.log(JSON.stringify({
        event: "progress_source_mismatch",
        routeId,
        runId: runData.id,
        runStatus,
        legacyNextStopId: legacyResult.nextStopId,
        persistedNextStopId: persistedResult.nextStopId,
        etaSource: legacyResult.etaSource,
        reason: !targetStopId ? "pointer_missing_or_invalid" : "different_selection",
      }));
    }

    etaResult = legacyResult;
  } else if (mode === "persisted") {
    if (targetStopId) {
      etaResult = await computeEta({ ...etaArgs, targetStopId });
    } else {
      // Fallback to legacy when pointer is invalid/missing/stale
      if (runData.next_stop_id) {
        const reason = !entryIds.has(runData.next_stop_id)
          ? "pointer_invalid"
          : "pointer_stale_or_not_pending";
        console.log(JSON.stringify({
          event: "progress_source_fallback",
          routeId,
          runId: runData.id,
          runStatus,
          reason,
        }));
      }
      etaResult = await computeEta(etaArgs);
    }
  } else {
    // legacy mode — no targetStopId
    etaResult = await computeEta(etaArgs);
  }

  return {
    serviceDate,
    runStatus,
    shiftStartedAt: activeShift?.started_at ?? null,
    ...etaResult,
  };
}

function parseProgressSource(value: string | undefined): "legacy" | "shadow" | "persisted" {
  if (value === "shadow" || value === "persisted") return value;
  return "legacy";
}
