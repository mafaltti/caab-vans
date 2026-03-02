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

  const serviceDate = todayBahiaDate();

  // Find active run (started but not ended)
  const { data: run } = await supabase
    .from("route_runs")
    .select("id, started_at, ended_at")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .single();

  if (!run || !run.started_at) {
    return apiError("NOT_FOUND", "No active run found for today", 404);
  }

  if (run.ended_at) {
    return apiError("CONFLICT", "Route already ended today", 409);
  }

  const now = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("route_runs")
    .update({ ended_at: now })
    .eq("id", run.id)
    .select("id, route_id, service_date, started_at, ended_at")
    .single();

  if (error || !updated) {
    return apiError("INTERNAL_ERROR", "Failed to end route", 500);
  }

  return NextResponse.json({
    run: {
      id: updated.id,
      routeId: updated.route_id,
      serviceDate: updated.service_date,
      startedAt: updated.started_at,
      endedAt: updated.ended_at,
      status: "completed" as const,
    },
  });
}
