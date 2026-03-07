import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  nowBahia,
  todayBahiaDate,
  formatTime,
  formatTimeString,
  isWithinScheduleWindow,
  getNextStop,
  isLocationFresh,
} from "@/lib/time";
import { computeEta, ROAD_FACTOR, resolveNextStop, type VanPosition } from "@/lib/tracking/eta";
import { deriveRunStatus } from "@/lib/tracking/run-status";
import { buildRecentRuns } from "@/lib/tracking/time-factors";
import { DateTime } from "luxon";
import type { ScheduleStatus } from "@/types";

export async function GET() {
  const supabase = createServiceClient();
  const now = nowBahia();
  const currentTime = formatTime(now);

  const { data: routes, error } = await supabase
    .from("routes")
    .select(
      `
      id,
      name,
      van:vans!inner (
        id,
        location_url,
        location_updated_at,
        last_gps_fix_at,
        last_lat,
        last_lng,
        last_speed_mps,
        snapped_lat,
        snapped_lng,
        last_heading_deg
      ),
      schedule_entries (
        id,
        stop_name,
        time,
        stop_lat,
        stop_lng,
        osrm_distance_m
      )
    `,
    )
    .order("name");

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch routes" } },
      { status: 500 },
    );
  }

  const serviceDate = todayBahiaDate();

  const result = await Promise.all((routes ?? []).map(async (route) => {
    const van = route.van as unknown as {
      id: string;
      location_url: string | null;
      location_updated_at: string | null;
      last_gps_fix_at: string | null;
      last_lat: number | null;
      last_lng: number | null;
      last_speed_mps: number | null;
      snapped_lat: number | null;
      snapped_lng: number | null;
      last_heading_deg: number | null;
    };
    const entries = (route.schedule_entries ?? []) as {
      id: string;
      stop_name: string;
      time: string;
      stop_lat: number | null;
      stop_lng: number | null;
      osrm_distance_m?: number | null;
    }[];

    const times = entries.map((e) => e.time);
    const entryMapped = entries.map((e) => ({
      stopName: e.stop_name,
      time: formatTimeString(e.time),
    }));

    const locationFresh = van.last_gps_fix_at
      ? isLocationFresh(DateTime.fromISO(van.last_gps_fix_at))
      : false;

    const withinWindow = isWithinScheduleWindow(times, now);

    let scheduleStatus: ScheduleStatus = "not_started";
    if (times.length > 0) {
      const sorted = [...times].sort();
      const lastTime = sorted[sorted.length - 1];
      if (now.toFormat("HH:mm") > lastTime) {
        scheduleStatus = "ended";
      } else if (withinWindow) {
        scheduleStatus = "active";
      }
    }

    const sortedEntries = [...entries].sort((a, b) =>
      a.time.localeCompare(b.time),
    );
    const totalStops = sortedEntries.length;

    const hasSnapped = van.snapped_lat != null && van.snapped_lng != null;
    const vanPosition: VanPosition | null =
      van.last_lat != null &&
      van.last_lng != null &&
      van.last_speed_mps != null &&
      van.last_gps_fix_at != null
        ? {
            lat: hasSnapped ? van.snapped_lat! : van.last_lat,
            lng: hasSnapped ? van.snapped_lng! : van.last_lng,
            speedMps: van.last_speed_mps,
            lastGpsFixAt: DateTime.fromISO(van.last_gps_fix_at),
            headingDeg: van.last_heading_deg,
          }
        : null;

    const stopCoordsMap = new Map(
      entries.map((e) => [e.id, { stopLat: e.stop_lat, stopLng: e.stop_lng }]),
    );

    const { data: runData } = await supabase
      .from("route_runs")
      .select("id")
      .eq("route_id", route.id)
      .eq("service_date", serviceDate)
      .single();

    let progress = null;
    if (runData) {
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

      if (runStatus === "completed") {
        progress = {
          serviceDate,
          runStatus,
          shiftStartedAt: null,
          nextStopId: null,
          passedStopIds: [] as string[],
          etaNextStopISO: null,
          etaNextStopMinutes: null,
          delayMinutes: null,
          etaSource: null,
        };
      } else {
        const { data: runStops } = await supabase
          .from("route_run_stops")
          .select("schedule_entry_id, status, passed_at, schedule_entries!inner(time)")
          .eq("run_id", runData.id);

        if (runStops && runStops.length > 0) {
          // Query recent speed readings for smoothed ETA
          const recentSpeeds: Array<{speedMps: number; deviceTs: string}> = [];
          if (van.id) {
            const { data: recentPings } = await supabase
              .from("van_location_pings")
              .select("speed_mps, device_ts")
              .eq("van_id", van.id)
              .not("speed_mps", "is", null)
              .order("device_ts", { ascending: false })
              .limit(10);

            if (recentPings) {
              recentSpeeds.push(...recentPings.map((p) => ({
                speedMps: p.speed_mps as number,
                deviceTs: p.device_ts as string,
              })));
            }
          }

          // Build recentRuns from today's passed stops
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
          for (const e of entries) {
            if (e.osrm_distance_m != null) {
              osrmDistances.set(e.id, e.osrm_distance_m);
            }
          }

          const recentRuns = buildRecentRuns(passedStops, ROAD_FACTOR, osrmDistances);

          const etaResult = await computeEta({
            stops: runStops.map((rs) => {
              const coords = stopCoordsMap.get(rs.schedule_entry_id);
              return {
                scheduleEntryId: rs.schedule_entry_id,
                time: (rs.schedule_entries as unknown as { time: string }).time,
                status: rs.status as "pending" | "passed",
                passedAt: rs.passed_at,
                stopLat: coords?.stopLat ?? null,
                stopLng: coords?.stopLng ?? null,
              };
            }),
            now,
            vanPosition,
            startedAt: activeShift?.started_at,
            osrmBaseUrl: process.env.OSRM_BASE_URL,
            routeId: route.id,
            recentRuns,
            recentSpeeds,
          });
          progress = {
            serviceDate,
            runStatus,
            shiftStartedAt: activeShift?.started_at ?? null,
            ...etaResult,
          };
        } else {
          progress = {
            serviceDate,
            runStatus,
            shiftStartedAt: activeShift?.started_at ?? null,
            nextStopId: null,
            passedStopIds: [] as string[],
            etaNextStopISO: null,
            etaNextStopMinutes: null,
            delayMinutes: null,
            etaSource: null,
          };
        }
      }
    }

    const isRunning = withinWindow && locationFresh &&
      progress?.runStatus === "in_progress";

    let nextStop = isRunning ? getNextStop(entryMapped, now) : null;

    let currentStopIndex = nextStop
      ? sortedEntries.findIndex(
          (e) => formatTimeString(e.time) === nextStop!.time,
        )
      : null;

    let nextStopEntry = nextStop
      ? sortedEntries.find(
          (e) => formatTimeString(e.time) === nextStop!.time,
        )
      : null;

    // Override next stop with tracking-based stop when progress is active
    if (isRunning && progress?.nextStopId) {
      const resolved = resolveNextStop(sortedEntries, progress.nextStopId, formatTimeString);
      if (resolved) {
        nextStop = resolved.nextStop;
        currentStopIndex = resolved.currentStopIndex;
        nextStopEntry = resolved.nextStopEntry;
      }
    }

    return {
      id: route.id,
      name: route.name,
      isRunning,
      nextStop: nextStop
        ? {
            stopName: nextStop.stopName,
            time: nextStop.time,
            id: nextStopEntry?.id ?? null,
          }
        : null,
      scheduleStatus,
      totalStops,
      currentStopIndex:
        currentStopIndex !== null && currentStopIndex !== -1
          ? currentStopIndex
          : null,
      van: {
        id: van.id,
        locationUrl: van.location_url,
        lastGpsFixAt: van.last_gps_fix_at,
        isLocationOutdated: !locationFresh,
        lastLat: hasSnapped ? van.snapped_lat : van.last_lat,
        lastLng: hasSnapped ? van.snapped_lng : van.last_lng,
      },
      progress,
    };
  }));

  return NextResponse.json({ routes: result, serverTime: currentTime });
}
