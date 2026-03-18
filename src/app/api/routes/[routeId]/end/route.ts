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
    .select("id, van_id")
    .eq("id", routeId)
    .single();

  if (!route) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  const serviceDate = todayBahiaDate();

  const { data: run } = await supabase
    .from("route_runs")
    .select("id, route_id, service_date")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .single();

  if (!run) {
    return apiError("NOT_FOUND", "No active run found for today", 404);
  }

  const { data: activeShift } = await supabase
    .from("route_shifts")
    .select("id, run_id, driver_id, started_at, ended_at")
    .eq("run_id", run.id)
    .is("ended_at", null)
    .single();

  if (!activeShift) {
    return apiError("NOT_FOUND", "No active shift found for today", 404);
  }

  if (activeShift.driver_id !== auth.user.id) {
    return apiError("FORBIDDEN", "This shift was started by a different driver", 403);
  }

  const now = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("route_shifts")
    .update({ ended_at: now })
    .eq("id", activeShift.id)
    .select("id, run_id, driver_id, started_at, ended_at")
    .single();

  if (error || !updated) {
    return apiError("INTERNAL_ERROR", "Failed to end shift", 500);
  }

  // Auto-deactivate detour if active
  const { data: runState } = await supabase
    .from("route_runs")
    .select("is_detour_active")
    .eq("id", run.id)
    .single();

  if (runState?.is_detour_active) {
    const { error: detourErr } = await supabase
      .from("route_runs")
      .update({
        is_detour_active: false,
        detour_reason_code: null,
        detour_note: null,
      })
      .eq("id", run.id);

    if (detourErr) {
      return apiError("INTERNAL_ERROR", "Failed to deactivate detour", 500);
    }

    const { error: eventErr } = await supabase
      .from("route_run_events")
      .insert({
        run_id: run.id,
        event_type: "detour_ended",
        actor_id: auth.user.id,
        reason_code: "shift_ended",
      });

    if (eventErr) {
      return apiError("INTERNAL_ERROR", "Failed to record detour_ended event", 500);
    }
  }

  // Expire pending corroborations (FR-014): any events still awaiting GPS
  // confirmation are discarded when the shift ends.
  if (route.van_id) {
    await supabase
      .from("tracking_geofence_events")
      .update({ status: "no_match" })
      .eq("van_id", route.van_id)
      .eq("status", "awaiting_corroboration");
  }

  return NextResponse.json({
    shift: {
      id: updated.id,
      runId: updated.run_id,
      driverId: updated.driver_id,
      startedAt: updated.started_at,
      endedAt: updated.ended_at,
    },
    run: {
      id: run.id,
      routeId: run.route_id,
      serviceDate: run.service_date,
    },
  });
}
