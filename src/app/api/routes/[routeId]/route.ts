import { NextResponse, type NextRequest } from "next/server";
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
import { resolveNextStop, type VanPosition } from "@/lib/tracking/eta";
import { deriveTrackingStatus } from "@/lib/tracking/tracking-status";
import { resolveRouteProgress } from "@/lib/tracking/resolve-route-progress";
import { apiError } from "@/lib/api/errors";
import { DateTime } from "luxon";
import type { ScheduleStatus } from "@/types";

export async function GET(
  request: NextRequest,
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
    .eq("id", routeId)
    .single();

  if (error || !route) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

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

  const sortedEntries = entries.sort((a, b) => a.time.localeCompare(b.time));
  const totalStops = sortedEntries.length;

  const schedule = sortedEntries.map((e) => ({
    id: e.id,
    stopName: e.stop_name,
    time: formatTimeString(e.time),
    stopLat: e.stop_lat,
    stopLng: e.stop_lng,
  }));

  const serviceDate = todayBahiaDate();
  const includeLastKnown = request.nextUrl.searchParams.get("includeLastKnown") === "true";

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

  const progress = await resolveRouteProgress({
    supabase,
    routeId: route.id,
    serviceDate,
    sortedEntries,
    vanId: van.id,
    vanPosition,
    now,
    times,
    includeLastKnown,
  });

  const isRunning = progress?.runStatus === "in_progress";

  const trackingStatus = deriveTrackingStatus(van.last_gps_fix_at, now);
  const isTrackingFresh = trackingStatus === "live";

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

  // Populate last-known summary for non-running routes when requested
  if (!isRunning && includeLastKnown && progress?.nextStopId) {
    const resolved = resolveNextStop(sortedEntries, progress.nextStopId, formatTimeString);
    if (resolved) {
      nextStop = resolved.nextStop;
      currentStopIndex = resolved.currentStopIndex;
      nextStopEntry = resolved.nextStopEntry;
    }
  }

  const nextStopMode = isRunning
    ? "live"
    : (nextStop ? "last_known" : null);

  return NextResponse.json({
    route: {
      id: route.id,
      name: route.name,
      isRunning,
      trackingStatus,
      isTrackingFresh,
      nextStop: nextStop
        ? {
            stopName: nextStop.stopName,
            time: nextStop.time,
            id: nextStopEntry?.id ?? null,
          }
        : null,
      nextStopMode,
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
      schedule,
      progress,
    },
    serverTime: currentTime,
  });
}
