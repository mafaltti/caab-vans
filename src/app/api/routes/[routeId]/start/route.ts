import { NextResponse, type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { requireAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { nowBahia, todayBahiaDate } from "@/lib/time";
import { suggestStartStop } from "@/lib/tracking/suggest-start-stop";
import { StartShiftBodySchema } from "@/lib/validators/route";

const COLD_START_THRESHOLD_MINUTES = 30;

type RouteParams = { params: Promise<{ routeId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  let auth;
  try {
    auth = await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  if (auth.role !== "driver") {
    return apiError("FORBIDDEN", "Driver access required", 403);
  }

  // Parse optional body (lat/lng for cold-start suggestion)
  let bodyLat: number | undefined;
  let bodyLng: number | undefined;
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = StartShiftBodySchema.safeParse(rawBody);
    if (parsed.success) {
      bodyLat = parsed.data.lat;
      bodyLng = parsed.data.lng;
    }
  } catch {
    // Body parsing failure is non-fatal — proceed without coords
  }

  const { routeId } = await params;
  const supabase = createServiceClient();

  const { data: route } = await supabase
    .from("routes")
    .select("id, van:vans!inner(id)")
    .eq("id", routeId)
    .single();

  if (!route) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  const van = route.van as unknown as { id: string };

  const { data: assignment } = await supabase
    .from("van_drivers")
    .select("van_id")
    .eq("van_id", van.id)
    .eq("driver_id", auth.user.id)
    .single();

  if (!assignment) {
    return apiError("FORBIDDEN", "You are not assigned to this route's van", 403);
  }

  const { count } = await supabase
    .from("schedule_entries")
    .select("*", { count: "exact", head: true })
    .eq("route_id", routeId);

  if (!count || count === 0) {
    return apiError("VALIDATION_ERROR", "Route has no schedule entries", 422);
  }

  const serviceDate = todayBahiaDate();

  const { data: existingRun } = await supabase
    .from("route_runs")
    .select("id")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .single();

  let runId: string;

  if (existingRun) {
    runId = existingRun.id;
  } else {
    const { data: newRun, error } = await supabase
      .from("route_runs")
      .insert({ route_id: routeId, service_date: serviceDate })
      .select("id")
      .single();

    if (error || !newRun) {
      return apiError("INTERNAL_ERROR", "Failed to create route run", 500);
    }
    runId = newRun.id;
  }

  const { data: activeShift } = await supabase
    .from("route_shifts")
    .select("id")
    .eq("run_id", runId)
    .is("ended_at", null)
    .single();

  if (activeShift) {
    return apiError("CONFLICT", "A shift is already active on this route today", 409);
  }

  const now = new Date().toISOString();

  const { data: shift, error: shiftError } = await supabase
    .from("route_shifts")
    .insert({ run_id: runId, driver_id: auth.user.id, started_at: now })
    .select("id, run_id, driver_id, started_at, ended_at")
    .single();

  if (shiftError || !shift) {
    return apiError("INTERNAL_ERROR", "Failed to start shift", 500);
  }

  const response: Record<string, unknown> = {
    shift: {
      id: shift.id,
      runId: shift.run_id,
      driverId: shift.driver_id,
      startedAt: shift.started_at,
      endedAt: shift.ended_at,
    },
    run: {
      id: runId,
      routeId,
      serviceDate,
    },
  };

  // Cold-start detection
  const coldStart = await detectColdStart({
    supabase,
    runId,
    routeId,
    vanId: van.id,
    bodyLat: bodyLat ?? null,
    bodyLng: bodyLng ?? null,
  });

  if (coldStart) {
    response.coldStart = coldStart;
  }

  return NextResponse.json(response);
}

async function detectColdStart(args: {
  supabase: ReturnType<typeof createServiceClient>;
  runId: string;
  routeId: string;
  vanId: string;
  bodyLat: number | null;
  bodyLng: number | null;
}) {
  const { supabase, runId, routeId, vanId, bodyLat, bodyLng } = args;
  const currentTime = nowBahia();

  // Check if run already has passed stops (resumed shift) → suppress
  const { count: passedCount } = await supabase
    .from("route_run_stops")
    .select("*", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("status", "passed");

  if (passedCount && passedCount > 0) return null;

  // Fetch schedule entries with time and coordinates
  const { data: entries } = await supabase
    .from("schedule_entries")
    .select("id, stop_name, time, stop_lat, stop_lng")
    .eq("route_id", routeId)
    .order("time", { ascending: true });

  if (!entries || entries.length === 0) return null;

  // FR-013: if zero entries have coordinates, skip cold-start entirely
  const hasCoordinates = entries.some(
    (e) => e.stop_lat != null && e.stop_lng != null,
  );
  if (!hasCoordinates) return null;

  // Check if this is a cold start (30+ min past first stop)
  const firstTime = entries[0].time;
  const [fh, fm] = firstTime.split(":").map(Number);
  const firstStopTime = currentTime.set({
    hour: fh,
    minute: fm,
    second: 0,
    millisecond: 0,
  });

  const minutesPastFirst = currentTime.diff(firstStopTime, "minutes").minutes;
  if (minutesPastFirst < COLD_START_THRESHOLD_MINUTES) return null;

  // Resolve GPS: body coords → fresh van ping → null
  let lat = bodyLat;
  let lng = bodyLng;

  if (lat == null || lng == null) {
    const fiveMinAgo = DateTime.now()
      .minus({ minutes: 5 })
      .toISO();

    const { data: recentPing } = await supabase
      .from("van_location_pings")
      .select("lat, lng")
      .eq("van_id", vanId)
      .gte("received_at", fiveMinAgo)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentPing) {
      lat = recentPing.lat;
      lng = recentPing.lng;
    }
  }

  return suggestStartStop({
    entries: entries.map((e) => ({
      id: e.id,
      stop_name: e.stop_name,
      time: e.time,
      stop_lat: e.stop_lat,
      stop_lng: e.stop_lng,
    })),
    lat,
    lng,
    now: currentTime,
  });
}
