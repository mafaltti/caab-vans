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
import { DateTime } from "luxon";
import type { ScheduleStatus } from "@/types";

export async function GET(request: NextRequest) {
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
        stop_sequence,
        arrival_time,
        departure_time,
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
  const includeLastKnown = request.nextUrl.searchParams.get("includeLastKnown") === "true";

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
      stop_sequence: number;
      arrival_time: string;
      departure_time: string;
      stop_lat: number | null;
      stop_lng: number | null;
      osrm_distance_m?: number | null;
    }[];

    const scheduleWindowEntries = entries.map((e) => ({
      departure_time: e.departure_time,
      arrival_time: e.arrival_time,
      stop_sequence: e.stop_sequence,
    }));
    const entryMapped = entries.map((e) => ({
      stopName: e.stop_name,
      time: formatTimeString(e.arrival_time),
      departureTime: formatTimeString(e.departure_time),
      stopSequence: e.stop_sequence,
    }));

    const locationFresh = van.last_gps_fix_at
      ? isLocationFresh(DateTime.fromISO(van.last_gps_fix_at))
      : false;

    const withinWindow = isWithinScheduleWindow(scheduleWindowEntries, now);

    let scheduleStatus: ScheduleStatus = "not_started";
    if (scheduleWindowEntries.length > 0) {
      const sorted = [...scheduleWindowEntries].sort((a, b) => a.stop_sequence - b.stop_sequence);
      const lastTime = sorted[sorted.length - 1].arrival_time;
      if (now.toFormat("HH:mm") > formatTimeString(lastTime)) {
        scheduleStatus = "ended";
      } else if (withinWindow) {
        scheduleStatus = "active";
      }
    }

    const sortedEntries = [...entries].sort((a, b) =>
      a.stop_sequence - b.stop_sequence,
    );
    const totalStops = sortedEntries.length;

    const hasSnapped = van.snapped_lat != null && van.snapped_lng != null;
    const vanPosition: VanPosition | null =
      van.last_lat != null &&
      van.last_lng != null &&
      van.last_speed_mps != null &&
      van.last_gps_fix_at != null
        ? {
            lat: van.last_lat,
            lng: van.last_lng,
            snappedLat: van.snapped_lat ?? null,
            snappedLng: van.snapped_lng ?? null,
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
      includeLastKnown,
    });

    const isRunning = progress?.runStatus === "in_progress";

    const trackingStatus = deriveTrackingStatus(van.last_gps_fix_at, now);
    const isTrackingFresh = trackingStatus === "live";

    let nextStop: { stopName: string; time: string; departureTime: string; stopSequence: number } | null = isRunning ? getNextStop(entryMapped, now) : null;

    let currentStopIndex = nextStop
      ? sortedEntries.findIndex(
          (e) => e.stop_sequence === nextStop!.stopSequence,
        )
      : null;

    let nextStopEntry: (typeof sortedEntries)[number] | undefined | null = nextStop
      ? sortedEntries.find(
          (e) => e.stop_sequence === nextStop!.stopSequence,
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
    // Exclude waiting routes — they haven't started yet, so stale progress is misleading
    if (!isRunning && includeLastKnown && progress?.nextStopId && progress.runStatus !== "waiting") {
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

    return {
      id: route.id,
      name: route.name,
      isRunning,
      trackingStatus,
      isTrackingFresh,
      nextStop: nextStop
        ? {
            stopName: nextStop.stopName,
            arrivalTime: nextStop.time,
            departureTime: nextStop.departureTime,
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
      progress,
    };
  }));

  return NextResponse.json({ routes: result, serverTime: currentTime });
}
