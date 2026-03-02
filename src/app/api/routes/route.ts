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
import { computeEta, type VanPosition } from "@/lib/tracking/eta";
import { deriveRunStatus } from "@/lib/tracking/run-status";
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
        last_lat,
        last_lng,
        last_speed_mps
      ),
      schedule_entries (
        id,
        stop_name,
        time,
        stop_lat,
        stop_lng
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
      last_lat: number | null;
      last_lng: number | null;
      last_speed_mps: number | null;
    };
    const entries = (route.schedule_entries ?? []) as {
      id: string;
      stop_name: string;
      time: string;
      stop_lat: number | null;
      stop_lng: number | null;
    }[];

    const times = entries.map((e) => e.time);
    const entryMapped = entries.map((e) => ({
      stopName: e.stop_name,
      time: formatTimeString(e.time),
    }));

    const locationFresh = van.location_updated_at
      ? isLocationFresh(DateTime.fromISO(van.location_updated_at))
      : false;

    const withinWindow = isWithinScheduleWindow(times, now);
    const isRunning = withinWindow && locationFresh;

    const nextStop = isRunning ? getNextStop(entryMapped, now) : null;

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
    const currentStopIndex = nextStop
      ? sortedEntries.findIndex(
          (e) => formatTimeString(e.time) === nextStop.time,
        )
      : null;

    const nextStopEntry = nextStop
      ? sortedEntries.find(
          (e) => formatTimeString(e.time) === nextStop.time,
        )
      : null;

    const vanPosition: VanPosition | null =
      van.last_lat != null &&
      van.last_lng != null &&
      van.last_speed_mps != null &&
      van.location_updated_at != null
        ? {
            lat: van.last_lat,
            lng: van.last_lng,
            speedMps: van.last_speed_mps,
            locationUpdatedAt: DateTime.fromISO(van.location_updated_at),
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
        progress = null;
      } else {
        const { data: runStops } = await supabase
          .from("route_run_stops")
          .select("schedule_entry_id, status, passed_at, schedule_entries!inner(time)")
          .eq("run_id", runData.id);

        if (runStops && runStops.length > 0) {
          const etaResult = computeEta({
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
        locationUpdatedAt: van.location_updated_at,
        isLocationOutdated: !locationFresh,
        lastLat: van.last_lat,
        lastLng: van.last_lng,
      },
      progress,
    };
  }));

  return NextResponse.json({ routes: result, serverTime: currentTime });
}
