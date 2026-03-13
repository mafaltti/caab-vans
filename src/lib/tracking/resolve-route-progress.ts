import { DateTime } from "luxon";
import { SupabaseClient } from "@supabase/supabase-js";

import { POINTER_ABSOLUTE_CEILING_MINUTES } from "@/lib/time";
import { computeEta, ROAD_FACTOR, type VanPosition } from "@/lib/tracking/eta";
import { isOrphanedShift } from "@/lib/tracking/orphaned-shift-health";
import { deriveRunStatus } from "@/lib/tracking/run-status";
import { buildRecentRuns } from "@/lib/tracking/time-factors";
import type { RunStatus } from "@/types";

export interface RouteProgress {
  serviceDate: string;
  runStatus: RunStatus;
  runHealth?: "normal" | "orphaned";
  shiftStartedAt: string | null;
  nextStopId: string | null;
  passedStopIds: string[];
  skippedStopIds: string[];
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  etaSource: "gps" | "gps_osrm" | "segment" | "schedule" | null;
  etaStatus: "estimated" | "overdue" | "none";
  hasSkippedStops: boolean;
  isDetourActive: boolean;
  detourReasonCode: string | null;
  detourNote: string | null;
}

interface ScheduleEntry {
  id: string;
  stop_name: string;
  stop_sequence: number;
  arrival_time: string;
  departure_time: string;
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
  includeLastKnown?: boolean;
}): Promise<RouteProgress | null> {
  const { supabase, routeId, serviceDate, sortedEntries, vanId, vanPosition, now, includeLastKnown } = args;

  // 1. Fetch route_run for today
  const { data: runData, error: runError } = await supabase
    .from("route_runs")
    .select("id, last_passed_stop_id, next_stop_id, progress_updated_at, is_detour_active, detour_reason_code, detour_note, has_skipped_stops")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .single();

  if (runError && runError.code !== "PGRST116") {
    console.error("resolveRouteProgress: route_runs query failed", {
      routeId, serviceDate, error: runError.message,
    });
  }

  if (!runData) return null;

  // 2. Fetch shifts and derive run status
  const { data: shifts, error: shiftsError } = await supabase
    .from("route_shifts")
    .select("id, started_at, ended_at")
    .eq("run_id", runData.id);

  if (shiftsError) {
    console.error("resolveRouteProgress: route_shifts query failed", {
      routeId, runId: runData.id, error: shiftsError.message,
    });
  }

  const shiftsArr = shifts ?? [];
  const lastTime = sortedEntries.length > 0 ? sortedEntries[sortedEntries.length - 1].departure_time : null;
  const isPastScheduleWindow = lastTime
    ? now.toFormat("HH:mm") > lastTime
    : false;
  const runStatus = deriveRunStatus(shiftsArr, isPastScheduleWindow);
  const activeShift = shiftsArr.find((s) => s.ended_at === null);

  // 3. Early return for completed, idle, and waiting runs (FR-011)
  if ((runStatus === "completed" || runStatus === "idle" || runStatus === "waiting") && !includeLastKnown) {
    return {
      serviceDate,
      runStatus,
      shiftStartedAt: null,
      nextStopId: null,
      passedStopIds: [],
      skippedStopIds: [],
      etaNextStopISO: null,
      etaNextStopMinutes: null,
      delayMinutes: null,
      etaSource: null,
      etaStatus: "none",
      hasSkippedStops: runData.has_skipped_stops ?? false,
      isDetourActive: runData.is_detour_active ?? false,
      detourReasonCode: runData.detour_reason_code ?? null,
      detourNote: runData.detour_note ?? null,
    };
  }

  // Waiting routes should never expose last-known progress — stale pointers
  // from a previous day's run are not meaningful for a waiting route.
  if (runStatus === "waiting" && includeLastKnown) {
    return {
      serviceDate,
      runStatus,
      shiftStartedAt: null,
      nextStopId: null,
      passedStopIds: [],
      skippedStopIds: [],
      etaNextStopISO: null,
      etaNextStopMinutes: null,
      delayMinutes: null,
      etaSource: null,
      etaStatus: "none",
      hasSkippedStops: runData.has_skipped_stops ?? false,
      isDetourActive: runData.is_detour_active ?? false,
      detourReasonCode: runData.detour_reason_code ?? null,
      detourNote: runData.detour_note ?? null,
    };
  }

  // 4. Fetch route_run_stops
  const { data: runStops, error: runStopsError } = await supabase
    .from("route_run_stops")
    .select("schedule_entry_id, status, passed_at, schedule_entries!inner(arrival_time, departure_time, stop_sequence)")
    .eq("run_id", runData.id);

  if (runStopsError) {
    console.error("resolveRouteProgress: route_run_stops query failed", {
      routeId, runId: runData.id, error: runStopsError.message,
    });
  }

  if (!runStops || runStops.length === 0) {
    return {
      serviceDate,
      runStatus,
      shiftStartedAt: activeShift?.started_at ?? null,
      nextStopId: null,
      passedStopIds: [],
      skippedStopIds: [],
      etaNextStopISO: null,
      etaNextStopMinutes: null,
      delayMinutes: null,
      etaSource: null,
      etaStatus: "none",
      hasSkippedStops: runData.has_skipped_stops ?? false,
      isDetourActive: runData.is_detour_active ?? false,
      detourReasonCode: runData.detour_reason_code ?? null,
      detourNote: runData.detour_note ?? null,
    };
  }

  // 4b. Compute contiguous resolved prefix: stops that are "passed" or "skipped"
  // before the first pending gap count as resolved for ETA math and delay.
  // Non-contiguous passed rows are demoted to "pending" for downstream consumers.
  const contiguousPassedIds = new Set<string>();
  const skippedStopIds: string[] = [];
  for (const entry of sortedEntries) {
    const rs = runStops.find((r) => r.schedule_entry_id === entry.id);
    if (rs && (rs.status === "passed" || rs.status === "skipped")) {
      contiguousPassedIds.add(entry.id);
      if (rs.status === "skipped") {
        skippedStopIds.push(entry.id);
      }
    } else {
      break; // first pending entry ends the contiguous chain
    }
  }
  // Also collect skipped stops outside the contiguous prefix
  for (const rs of runStops) {
    if (rs.status === "skipped" && !skippedStopIds.includes(rs.schedule_entry_id)) {
      skippedStopIds.push(rs.schedule_entry_id);
    }
  }
  const effectiveRunStops = runStops.map((rs) =>
    rs.status === "passed" && !contiguousPassedIds.has(rs.schedule_entry_id)
      ? { ...rs, status: "pending" as const, passed_at: null }
      : rs,
  );

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
  const passedStops = effectiveRunStops
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

  // 7. Validate persisted pointer (two-tier staleness)
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
    const pointerWithinCeiling = pointerAge >= 0 && pointerAge < POINTER_ABSOLUTE_CEILING_MINUTES;

    // Adjacency check: next_stop_id must be the immediate successor of last_passed_stop_id
    let pointerIsAdjacent = true;
    if (runData.last_passed_stop_id) {
      const lastPassedIdx = sortedEntries.findIndex((e) => e.id === runData.last_passed_stop_id);
      const nextStopIdx = sortedEntries.findIndex((e) => e.id === runData.next_stop_id);
      if (lastPassedIdx >= 0 && nextStopIdx >= 0 && lastPassedIdx + 1 !== nextStopIdx) {
        pointerIsAdjacent = false;
      }
      // Also check runStops: no pending stops between them (skipped stops are OK)
      if (pointerIsAdjacent && lastPassedIdx >= 0 && nextStopIdx >= 0) {
        for (let i = lastPassedIdx + 1; i < nextStopIdx; i++) {
          const entryId = sortedEntries[i].id;
          const rs = runStops.find((r) => r.schedule_entry_id === entryId);
          if (rs && rs.status === "pending") {
            pointerIsAdjacent = false;
            break;
          }
        }
      }
      // Allow adjacency when skipped stops exist between lastPassed and next
      if (!pointerIsAdjacent && lastPassedIdx >= 0 && nextStopIdx >= 0) {
        let allBetweenResolved = true;
        for (let i = lastPassedIdx + 1; i < nextStopIdx; i++) {
          const entryId = sortedEntries[i].id;
          const rs = runStops.find((r) => r.schedule_entry_id === entryId);
          if (!rs || rs.status === "pending") {
            allBetweenResolved = false;
            break;
          }
        }
        if (allBetweenResolved) pointerIsAdjacent = true;
      }
    }

    if (pointerExists && pointerIsPending && pointerWithinCeiling && pointerIsAdjacent) {
      targetStopId = runData.next_stop_id;
    }
  }

  // 8. Compute ETA — exclude skipped stops from ETA computation
  const stops = effectiveRunStops
    .filter((rs) => rs.status !== "skipped")
    .map((rs) => {
      const coords = stopCoordsMap.get(rs.schedule_entry_id);
      const entry = rs.schedule_entries as unknown as {
        arrival_time: string;
        departure_time: string;
        stop_sequence: number;
      };
      return {
        scheduleEntryId: rs.schedule_entry_id,
        stopSequence: entry.stop_sequence,
        arrivalTime: entry.arrival_time,
        departureTime: entry.departure_time,
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

  let etaResult: Awaited<ReturnType<typeof computeEta>>;

  if (targetStopId) {
    etaResult = await computeEta({ ...etaArgs, targetStopId });
  } else {
    // Self-heal: pointer invalid/missing — derive from contiguous prefix and repair
    if (contiguousPassedIds.size > 0 || sortedEntries.length > 0) {
      // Derive correct pointer from contiguous prefix
      let healedNextStopId: string | undefined;
      for (const entry of sortedEntries) {
        if (!contiguousPassedIds.has(entry.id)) {
          healedNextStopId = entry.id;
          break;
        }
      }

      let healedLastPassedStopId: string | null = null;
      const passedArr = [...contiguousPassedIds];
      if (passedArr.length > 0) {
        healedLastPassedStopId = passedArr[passedArr.length - 1];
      }

      if (healedNextStopId || healedLastPassedStopId) {
        // Persist repaired pointer
        await supabase
          .from("route_runs")
          .update({
            last_passed_stop_id: healedLastPassedStopId,
            next_stop_id: healedNextStopId ?? null,
            progress_updated_at: new Date().toISOString(),
          })
          .eq("id", runData.id);

        console.log(JSON.stringify({
          event: "progress_pointer_healed",
          routeId,
          runId: runData.id,
          healedNextStopId: healedNextStopId ?? null,
          healedLastPassedStopId,
        }));
      }

      if (healedNextStopId) {
        etaResult = await computeEta({ ...etaArgs, targetStopId: healedNextStopId });
      } else {
        etaResult = await computeEta(etaArgs);
      }
    } else {
      etaResult = await computeEta(etaArgs);
    }
  }

  // When includeLastKnown brought us here for a non-running route but the
  // persisted pointer was invalid/stale, the legacy fallback re-derives
  // nextStopId from the schedule. Null it out so the route handler doesn't
  // advertise a schedule guess as persisted "last_known" progress.
  const isNonRunning = runStatus !== "in_progress";
  if (includeLastKnown && isNonRunning && !targetStopId) {
    etaResult = { ...etaResult, nextStopId: null, etaNextStopISO: null, etaNextStopMinutes: null };
  }

  // Compute run health for open shifts
  let runHealth: "normal" | "orphaned" = "normal";
  if (activeShift && sortedEntries.length > 0) {
    const lastEntryTime = sortedEntries[sortedEntries.length - 1].departure_time;
    const [h, m] = lastEntryTime.split(":").map(Number);
    const scheduledEnd = DateTime.fromISO(serviceDate, { zone: now.zone })
      .set({ hour: h, minute: m, second: 0, millisecond: 0 });

    // Best available activity timestamp
    const activityCandidates = [
      vanPosition?.lastGpsFixAt,
      runData.progress_updated_at ? DateTime.fromISO(runData.progress_updated_at) : null,
      DateTime.fromISO(activeShift.started_at),
    ].filter((t): t is DateTime => t != null);
    const lastActivity = activityCandidates.length > 0
      ? DateTime.max(...activityCandidates)!
      : DateTime.fromISO(activeShift.started_at);

    if (isOrphanedShift({ scheduledEnd, lastActivity, now })) {
      runHealth = "orphaned";
    }
  }

  return {
    serviceDate,
    runStatus,
    runHealth,
    shiftStartedAt: activeShift?.started_at ?? null,
    ...etaResult,
    skippedStopIds,
    hasSkippedStops: runData.has_skipped_stops ?? false,
    isDetourActive: runData.is_detour_active ?? false,
    detourReasonCode: runData.detour_reason_code ?? null,
    detourNote: runData.detour_note ?? null,
  };
}
