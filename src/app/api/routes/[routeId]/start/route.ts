import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { todayBahiaDate } from "@/lib/time";
import type { RunStatus } from "@/types";

type RouteParams = { params: Promise<{ routeId: string }> };

function deriveStatus(startedAt: string | null, endedAt: string | null): RunStatus {
  if (endedAt) return "completed";
  if (startedAt) return "in_progress";
  return "waiting";
}

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

  // Fetch route + van
  const { data: route } = await supabase
    .from("routes")
    .select("id, van:vans!inner(id, driver_id)")
    .eq("id", routeId)
    .single();

  if (!route) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  const van = route.van as unknown as { id: string; driver_id: string | null };

  if (van.driver_id !== auth.user.id) {
    return apiError("FORBIDDEN", "You are not assigned to this route's van", 403);
  }

  // Check route has schedule entries
  const { count } = await supabase
    .from("schedule_entries")
    .select("*", { count: "exact", head: true })
    .eq("route_id", routeId);

  if (!count || count === 0) {
    return apiError("VALIDATION_ERROR", "Route has no schedule entries", 422);
  }

  const serviceDate = todayBahiaDate();

  // Check if run already started today
  const { data: existingRun } = await supabase
    .from("route_runs")
    .select("id, started_at, ended_at")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .single();

  if (existingRun?.started_at) {
    return apiError("CONFLICT", "Route already started today", 409);
  }

  const now = new Date().toISOString();

  let run;
  if (existingRun) {
    // Update existing run (created by GPS pings)
    const { data, error } = await supabase
      .from("route_runs")
      .update({ started_at: now })
      .eq("id", existingRun.id)
      .select("id, route_id, service_date, started_at, ended_at")
      .single();

    if (error || !data) {
      return apiError("INTERNAL_ERROR", "Failed to start route", 500);
    }
    run = data;
  } else {
    // Create new run with started_at
    const { data, error } = await supabase
      .from("route_runs")
      .insert({
        route_id: routeId,
        service_date: serviceDate,
        started_at: now,
      })
      .select("id, route_id, service_date, started_at, ended_at")
      .single();

    if (error || !data) {
      return apiError("INTERNAL_ERROR", "Failed to start route", 500);
    }
    run = data;
  }

  return NextResponse.json({
    run: {
      id: run.id,
      routeId: run.route_id,
      serviceDate: run.service_date,
      startedAt: run.started_at,
      endedAt: run.ended_at,
      status: deriveStatus(run.started_at, run.ended_at),
    },
  });
}
