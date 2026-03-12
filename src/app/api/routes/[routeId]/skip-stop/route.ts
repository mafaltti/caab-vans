import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { todayBahiaDate } from "@/lib/time";
import { SkipStopBodySchema } from "@/lib/validators/route-exceptions";
import { persistCanonicalProgress } from "@/lib/tracking/persist-canonical-progress";

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

  const { routeId } = await params;
  const supabase = createServiceClient();

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = SkipStopBodySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { stopId, reasonCode, note } = parsed.data;

  // Verify route exists
  const { data: route } = await supabase
    .from("routes")
    .select("id")
    .eq("id", routeId)
    .single();

  if (!route) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  const serviceDate = todayBahiaDate();

  // Fetch route run for today
  const { data: run } = await supabase
    .from("route_runs")
    .select("id, next_stop_id")
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

  // Check idempotency — stop already skipped by same actor
  const { data: existingStop } = await supabase
    .from("route_run_stops")
    .select("schedule_entry_id, status, reason_code, note, acted_by, acted_at")
    .eq("run_id", run.id)
    .eq("schedule_entry_id", stopId)
    .single();

  if (!existingStop) {
    return apiError("NOT_FOUND", "Stop not found in this run", 404);
  }

  if (existingStop.status === "skipped" && existingStop.acted_by === auth.user.id) {
    // Idempotent: already skipped by same driver
    const { data: stopEntry } = await supabase
      .from("schedule_entries")
      .select("stop_name")
      .eq("id", stopId)
      .single();

    return NextResponse.json({
      skipped: true,
      stop: {
        scheduleEntryId: stopId,
        stopName: stopEntry?.stop_name ?? "",
        status: "skipped",
        reasonCode: existingStop.reason_code,
        note: existingStop.note,
        actedBy: existingStop.acted_by,
        actedAt: existingStop.acted_at,
      },
      progress: {
        nextStopId: run.next_stop_id,
        lastPassedStopId: null,
        hasSkippedStops: true,
      },
      event: null,
    });
  }

  if (existingStop.status === "passed") {
    return apiError("CONFLICT", "Stop is already passed", 409);
  }

  if (existingStop.status === "skipped") {
    return apiError("CONFLICT", "Stop is already skipped", 409);
  }

  // Enforce head-of-line: stopId must match current next_stop_id
  if (run.next_stop_id !== stopId) {
    return apiError("CONFLICT", "Can only skip the current next stop", 409);
  }

  const now = new Date().toISOString();

  // Update route_run_stops: mark as skipped
  const { error: updateError } = await supabase
    .from("route_run_stops")
    .update({
      status: "skipped",
      reason_code: reasonCode,
      note: note ?? null,
      acted_by: auth.user.id,
      acted_at: now,
    })
    .eq("run_id", run.id)
    .eq("schedule_entry_id", stopId);

  if (updateError) {
    return apiError("INTERNAL_ERROR", "Failed to skip stop", 500);
  }

  // Insert audit event
  const { data: event, error: eventError } = await supabase
    .from("route_run_events")
    .insert({
      run_id: run.id,
      event_type: "stop_skipped",
      schedule_entry_id: stopId,
      actor_id: auth.user.id,
      reason_code: reasonCode,
      note: note ?? null,
    })
    .select("id, event_type, created_at")
    .single();

  if (eventError) {
    console.error("skip-stop: event insert failed", { runId: run.id, stopId, error: eventError.message });
  }

  // Set has_skipped_stops flag
  await supabase
    .from("route_runs")
    .update({ has_skipped_stops: true })
    .eq("id", run.id);

  // Advance next_stop_id via canonical progress
  const canonical = await persistCanonicalProgress(supabase, run.id);

  // Get stop name for response
  const { data: stopEntry } = await supabase
    .from("schedule_entries")
    .select("stop_name")
    .eq("id", stopId)
    .single();

  return NextResponse.json({
    skipped: true,
    stop: {
      scheduleEntryId: stopId,
      stopName: stopEntry?.stop_name ?? "",
      status: "skipped",
      reasonCode,
      note: note ?? null,
      actedBy: auth.user.id,
      actedAt: now,
    },
    progress: {
      nextStopId: canonical.nextStopId,
      lastPassedStopId: canonical.lastPassedStopId,
      hasSkippedStops: true,
    },
    event: event
      ? { id: event.id, eventType: event.event_type, createdAt: event.created_at }
      : null,
  });
}
