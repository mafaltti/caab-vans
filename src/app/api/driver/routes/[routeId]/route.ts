import { NextResponse, type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { requireAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { nowBahia, todayBahiaDate, formatTime, formatTimeString, isLocationFresh } from "@/lib/time";
import { resolveRouteProgress } from "@/lib/tracking/resolve-route-progress";
import { deriveTrackingStatus } from "@/lib/tracking/tracking-status";
import type { VanPosition } from "@/lib/tracking/eta";
import type { ScheduleStatus } from "@/types";

type RouteParams = { params: Promise<{ routeId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  let auth;
  try {
    auth = await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  if (auth.role !== "driver") {
    return apiError("FORBIDDEN", "Driver access required", 403);
  }

  const { routeId } = await params;
  const supabase = createServiceClient();
  const now = nowBahia();
  const serviceDate = todayBahiaDate();

  // Verify driver is assigned to this route
  const { data: routeDriver } = await supabase
    .from("route_drivers")
    .select("route_id")
    .eq("route_id", routeId)
    .eq("driver_id", auth.user.id)
    .maybeSingle();

  if (!routeDriver) {
    return apiError("FORBIDDEN", "Not assigned to this route", 403);
  }

  // Verify requesting driver owns the active shift
  const { data: activeRun } = await supabase
    .from("route_runs")
    .select("id")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .maybeSingle();

  if (activeRun) {
    const { data: activeShift } = await supabase
      .from("route_shifts")
      .select("driver_id")
      .eq("run_id", activeRun.id)
      .is("ended_at", null)
      .maybeSingle();

    if (activeShift && activeShift.driver_id !== auth.user.id) {
      return apiError("FORBIDDEN", "Another driver owns the active shift", 403);
    }
  }

  // Fetch route with van and schedule
  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select(
      `
      id,
      name,
      van:vans!inner (
        id,
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
    .eq("id", routeId)
    .single();

  if (routeError || !route) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  const van = route.van as unknown as {
    id: string;
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

  const sortedEntries = [...entries].sort((a, b) => a.stop_sequence - b.stop_sequence);

  // Schedule status
  const scheduleWindowEntries = entries.map((e) => ({
    departure_time: e.departure_time,
    arrival_time: e.arrival_time,
    stop_sequence: e.stop_sequence,
  }));

  let scheduleStatus: ScheduleStatus = "not_started";
  if (scheduleWindowEntries.length > 0) {
    const sorted = [...scheduleWindowEntries].sort((a, b) => a.stop_sequence - b.stop_sequence);
    const lastTime = sorted[sorted.length - 1].arrival_time;
    if (now.toFormat("HH:mm") > formatTimeString(lastTime)) {
      scheduleStatus = "ended";
    } else {
      const first = sorted[0].departure_time;
      if (now.toFormat("HH:mm") >= formatTimeString(first)) {
        scheduleStatus = "active";
      }
    }
  }

  // Van position
  const hasSnapped = van.snapped_lat != null && van.snapped_lng != null;
  const vanPosition: VanPosition | null =
    van.last_lat != null && van.last_lng != null && van.last_speed_mps != null && van.last_gps_fix_at != null
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

  // Resolve route progress
  const progress = await resolveRouteProgress({
    supabase,
    routeId: route.id,
    serviceDate,
    sortedEntries,
    vanId: van.id,
    vanPosition,
    now,
  });

  const isRunning = progress?.runStatus === "in_progress";
  const trackingStatus = deriveTrackingStatus(van.last_gps_fix_at, now);
  const locationFresh = van.last_gps_fix_at
    ? isLocationFresh(DateTime.fromISO(van.last_gps_fix_at))
    : false;

  // Fetch route_run_stops for per-stop status
  const stopStatusMap = new Map<string, { status: string; reasonCode: string | null; note: string | null; passedAt: string | null }>();
  if (progress && activeRun) {
    const { data: runStops } = await supabase
      .from("route_run_stops")
      .select("schedule_entry_id, status, passed_at, reason_code, note")
      .eq("run_id", activeRun.id);

    if (runStops) {
      for (const rs of runStops) {
        stopStatusMap.set(rs.schedule_entry_id, {
          status: rs.status,
          reasonCode: rs.reason_code,
          note: rs.note,
          passedAt: rs.passed_at,
        });
      }
    }
  }

  // Build schedule with per-stop status
  const schedule = sortedEntries.map((e) => {
    const stopStatus = stopStatusMap.get(e.id);
    return {
      id: e.id,
      stopName: e.stop_name,
      arrivalTime: formatTimeString(e.arrival_time),
      departureTime: formatTimeString(e.departure_time),
      stopSequence: e.stop_sequence,
      stopLat: e.stop_lat,
      stopLng: e.stop_lng,
      status: (stopStatus?.status as "pending" | "passed" | "skipped") ?? null,
      passedAt: stopStatus?.passedAt ?? null,
      reasonCode: stopStatus?.reasonCode ?? null,
      note: stopStatus?.note ?? null,
    };
  });

  // Current stop index
  let currentStopIndex: number | null = null;
  if (progress?.nextStopId) {
    const idx = sortedEntries.findIndex((e) => e.id === progress.nextStopId);
    if (idx >= 0) currentStopIndex = idx;
  }

  // Tracker health — query latest ping
  let trackerHealth: {
    lastPingAt: string | null;
    minutesSinceLastPing: number | null;
    batteryLevel: number | null;
    networkType: string | null;
    bufferSize: number | null;
    failureCount: number | null;
    isStale: boolean;
    isLowBattery: boolean;
  } | null = null;

  const { data: latestPing } = await supabase
    .from("van_location_pings")
    .select("device_ts, battery_level, network_type, buffer_size, failure_count")
    .eq("van_id", van.id)
    .order("device_ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestPing) {
    const pingTime = DateTime.fromISO(latestPing.device_ts);
    const minutesSince = now.diff(pingTime, "minutes").minutes;
    const batteryLevel = latestPing.battery_level as number | null;
    trackerHealth = {
      lastPingAt: latestPing.device_ts,
      minutesSinceLastPing: Math.max(0, Math.round(minutesSince)),
      batteryLevel,
      networkType: latestPing.network_type as string | null,
      bufferSize: latestPing.buffer_size as number | null,
      failureCount: latestPing.failure_count as number | null,
      isStale: minutesSince > 5,
      isLowBattery: batteryLevel != null && batteryLevel < 0.20,
    };
  }

  return NextResponse.json({
    route: {
      id: route.id,
      name: route.name,
      isRunning,
      trackingStatus,
      isTrackingFresh: trackingStatus === "live",
      scheduleStatus,
      totalStops: sortedEntries.length,
      currentStopIndex,
      progress,
      schedule,
      van: {
        id: van.id,
        lastLat: hasSnapped ? van.snapped_lat : van.last_lat,
        lastLng: hasSnapped ? van.snapped_lng : van.last_lng,
        lastGpsFixAt: van.last_gps_fix_at,
        isLocationOutdated: !locationFresh,
      },
      trackerHealth,
    },
    serverTime: formatTime(now),
  });
}
