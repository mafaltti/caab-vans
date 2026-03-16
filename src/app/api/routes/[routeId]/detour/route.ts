import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, requireBoundVan } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { todayBahiaDate } from "@/lib/time";
import { DetourBodySchema } from "@/lib/validators/route-exceptions";

type RouteParams = { params: Promise<{ routeId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  let auth;
  try {
    auth = await requireAuth(request);
  } catch (e) {
    return e as NextResponse;
  }

  if (auth.role !== "driver") {
    return apiError("FORBIDDEN", "Driver access required", 403);
  }

  let boundVanId: string | null = null;
  try {
    boundVanId = await requireBoundVan(request);
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId } = await params;
  const supabase = createServiceClient();

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = DetourBodySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { action, reasonCode, note } = parsed.data;

  // Verify route exists
  const { data: route } = await supabase
    .from("routes")
    .select("id, van_id")
    .eq("id", routeId)
    .single();

  if (!route) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  if (boundVanId && route.van_id !== boundVanId) {
    return apiError("FORBIDDEN", "Route not assigned to this van", 403);
  }

  const serviceDate = todayBahiaDate();

  // Fetch route run for today
  const { data: run } = await supabase
    .from("route_runs")
    .select("id, is_detour_active")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .single();

  if (!run) {
    return apiError("NOT_FOUND", "No route run exists for today", 404);
  }

  // Verify active shift owned by this driver
  const { data: activeShift } = await supabase
    .from("route_shifts")
    .select("id, driver_id")
    .eq("run_id", run.id)
    .is("ended_at", null)
    .single();

  if (!activeShift) {
    return apiError("FORBIDDEN", "No active shift for this route today", 403);
  }

  if (activeShift.driver_id !== auth.user.id) {
    return apiError("FORBIDDEN", "This shift was started by a different driver", 403);
  }

  const now = new Date().toISOString();

  if (action === "start") {
    if (run.is_detour_active) {
      return apiError("CONFLICT", "Detour is already active", 409);
    }

    // Update route_runs
    const { error: updateError } = await supabase
      .from("route_runs")
      .update({
        is_detour_active: true,
        detour_reason_code: reasonCode ?? null,
        detour_note: note ?? null,
      })
      .eq("id", run.id);

    if (updateError) {
      return apiError("INTERNAL_ERROR", "Failed to start detour", 500);
    }

    // Insert audit event
    const { data: event, error: eventError } = await supabase
      .from("route_run_events")
      .insert({
        run_id: run.id,
        event_type: "detour_started",
        actor_id: auth.user.id,
        reason_code: reasonCode ?? null,
        note: note ?? null,
      })
      .select("id, event_type, created_at")
      .single();

    if (eventError) {
      console.error("detour: event insert failed", { runId: run.id, error: eventError.message });
    }

    return NextResponse.json({
      detour: {
        active: true,
        reasonCode: reasonCode ?? null,
        note: note ?? null,
        startedAt: now,
        startedBy: auth.user.id,
      },
      event: event
        ? { id: event.id, eventType: event.event_type, createdAt: event.created_at }
        : null,
    });
  }

  // action === "end"
  if (!run.is_detour_active) {
    return apiError("CONFLICT", "Detour is not active", 409);
  }

  // Clear detour state
  const { error: updateError } = await supabase
    .from("route_runs")
    .update({
      is_detour_active: false,
      detour_reason_code: null,
      detour_note: null,
    })
    .eq("id", run.id);

  if (updateError) {
    return apiError("INTERNAL_ERROR", "Failed to end detour", 500);
  }

  // Insert audit event
  const { data: event, error: eventError } = await supabase
    .from("route_run_events")
    .insert({
      run_id: run.id,
      event_type: "detour_ended",
      actor_id: auth.user.id,
    })
    .select("id, event_type, created_at")
    .single();

  if (eventError) {
    console.error("detour: event insert failed", { runId: run.id, error: eventError.message });
  }

  return NextResponse.json({
    detour: {
      active: false,
      endedAt: now,
      endedBy: auth.user.id,
    },
    event: event
      ? { id: event.id, eventType: event.event_type, createdAt: event.created_at }
      : null,
  });
}
