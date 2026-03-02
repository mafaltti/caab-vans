import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { todayBahiaDate } from "@/lib/time";

type RouteParams = { params: Promise<{ routeId: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
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

  return NextResponse.json({
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
  });
}
