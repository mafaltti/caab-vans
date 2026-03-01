import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  nowBahia,
  todayBahiaDate,
  formatTime,
  formatTimeString,
  isWithinScheduleWindow,
  getNextStop,
  isSameDay,
} from "@/lib/time";
import { computeEta } from "@/lib/tracking/eta";
import { apiError } from "@/lib/api/errors";
import { DateTime } from "luxon";
import type { ScheduleStatus } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await params;
  const supabase = createServiceClient();
  const now = nowBahia();
  const currentTime = formatTime(now);

  const { data: route, error } = await supabase
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
        last_lng
      ),
      schedule_entries (
        id,
        stop_name,
        time
      )
    `,
    )
    .eq("id", routeId)
    .single();

  if (error || !route) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  const van = route.van as unknown as {
    id: string;
    location_url: string | null;
    location_updated_at: string | null;
    last_lat: number | null;
    last_lng: number | null;
  };
  const entries = (route.schedule_entries ?? []) as {
    id: string;
    stop_name: string;
    time: string;
  }[];

  const times = entries.map((e) => e.time);
  const entryMapped = entries.map((e) => ({
    stopName: e.stop_name,
    time: formatTimeString(e.time),
  }));

  const isLocationUpdatedToday = van.location_updated_at
    ? isSameDay(DateTime.fromISO(van.location_updated_at))
    : false;

  const withinWindow = isWithinScheduleWindow(times, now);
  const isRunning = withinWindow && isLocationUpdatedToday;

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

  const sortedEntries = entries.sort((a, b) => a.time.localeCompare(b.time));
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

  const schedule = sortedEntries.map((e) => ({
    id: e.id,
    stopName: e.stop_name,
    time: formatTimeString(e.time),
  }));

  const serviceDate = todayBahiaDate();

  const { data: runData } = await supabase
    .from("route_runs")
    .select("id")
    .eq("route_id", route.id)
    .eq("service_date", serviceDate)
    .single();

  let progress = null;
  if (runData) {
    const { data: runStops } = await supabase
      .from("route_run_stops")
      .select("schedule_entry_id, status, passed_at, schedule_entries!inner(time)")
      .eq("run_id", runData.id);

    if (runStops && runStops.length > 0) {
      const etaResult = computeEta({
        stops: runStops.map((rs) => ({
          scheduleEntryId: rs.schedule_entry_id,
          time: (rs.schedule_entries as unknown as { time: string }).time,
          status: rs.status as "pending" | "passed",
          passedAt: rs.passed_at,
        })),
        now,
      });
      progress = {
        serviceDate,
        ...etaResult,
      };
    }
  }

  return NextResponse.json({
    route: {
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
        isLocationOutdated: !isLocationUpdatedToday,
        lastLat: van.last_lat,
        lastLng: van.last_lng,
      },
      schedule,
      progress,
    },
    serverTime: currentTime,
  });
}
