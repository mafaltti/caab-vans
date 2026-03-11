import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { todayBahiaDate } from "@/lib/time";
import { enforceCanonicalPrefix } from "@/lib/tracking/enforce-canonical-prefix";
import { seedRouteRunStops } from "@/lib/tracking/seed-route-run-stops";
import { ConfirmStartStopBodySchema } from "@/lib/validators/route";

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

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = ConfirmStartStopBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "stopId is required and must be a valid UUID", 400);
  }

  const { stopId } = parsed.data;
  const { routeId } = await params;
  const supabase = createServiceClient();
  const serviceDate = todayBahiaDate();

  // Validate stopId belongs to this route's schedule entries
  const { data: entryCheck } = await supabase
    .from("schedule_entries")
    .select("id")
    .eq("id", stopId)
    .eq("route_id", routeId)
    .single();

  if (!entryCheck) {
    return apiError("VALIDATION_ERROR", "Stop does not belong to this route", 400);
  }

  // Find active run for today
  const { data: run } = await supabase
    .from("route_runs")
    .select("id, next_stop_id")
    .eq("route_id", routeId)
    .eq("service_date", serviceDate)
    .single();

  if (!run) {
    return apiError("FORBIDDEN", "No active run for this route today", 403);
  }

  // Validate driver has an active shift on this run
  const { data: activeShift } = await supabase
    .from("route_shifts")
    .select("id, driver_id")
    .eq("run_id", run.id)
    .is("ended_at", null)
    .single();

  if (!activeShift || activeShift.driver_id !== auth.user.id) {
    return apiError("FORBIDDEN", "No active shift found for this driver", 403);
  }

  // Seed route_run_stops if missing
  await seedRouteRunStops(supabase, run.id, routeId);

  // Fetch all stops in schedule order
  const { data: allStops } = await supabase
    .from("route_run_stops")
    .select(
      "schedule_entry_id, status, pass_source, schedule_entries!inner(stop_sequence)",
    )
    .eq("run_id", run.id);

  if (!allStops || allStops.length === 0) {
    return apiError("INTERNAL_ERROR", "No stops found for this run", 500);
  }

  // Sort by stop_sequence
  allStops.sort((a, b) => {
    const sa = (a.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
    const sb = (b.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
    return sa - sb;
  });

  const targetStop = allStops.find(
    (s) => s.schedule_entry_id === stopId,
  );

  // Idempotency: after a successful confirmation the run's next_stop_id is set
  // to the confirmed stop (which stays pending). Detect retries by checking
  // if the pointer already matches and all passed stops are manual.
  if (run.next_stop_id === stopId) {
    const passedStops = allStops.filter((s) => s.status === "passed");
    const allManual =
      passedStops.length > 0 &&
      passedStops.every((s) => s.pass_source === "manual");

    if (allManual) {
      const canonical = enforceCanonicalPrefix(
        allStops.map((s) => ({
          schedule_entry_id: s.schedule_entry_id,
          status: s.status as "pending" | "passed",
        })),
      );

      return NextResponse.json({
        confirmed: true,
        nextStopId: canonical.nextStopId,
        lastPassedStopId: canonical.lastPassedStopId,
        passedCount: passedStops.length,
      });
    }
  }

  // Cold-start invariant: reject if any stops are already passed
  const hasPassedStops = allStops.some((s) => s.status === "passed");
  if (hasPassedStops) {
    return apiError(
      "CONFLICT",
      "Cannot confirm start stop: route already has passed stops",
      409,
    );
  }

  // Geofence guard: reject if any geofence-based passes exist
  const hasGeofencePasses = allStops.some(
    (s) =>
      s.pass_source === "geofence_raw" ||
      s.pass_source === "geofence_snapped" ||
      s.pass_source === "device_geofence",
  );
  if (hasGeofencePasses) {
    return apiError(
      "CONFLICT",
      "Cannot confirm start stop: geofence passes already exist",
      409,
    );
  }

  // Find all stops sequentially before the confirmed stop
  const confirmedStopSequence = (
    targetStop!.schedule_entries as unknown as { stop_sequence: number }
  ).stop_sequence;
  const priorStopIds = allStops
    .filter((s) => {
      const seq = (s.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
      return seq < confirmedStopSequence && s.status === "pending";
    })
    .map((s) => s.schedule_entry_id);

  const nowIso = new Date().toISOString();

  // Bulk mark prior stops as passed
  if (priorStopIds.length > 0) {
    const { error: bulkError } = await supabase
      .from("route_run_stops")
      .update({
        status: "passed",
        pass_source: "manual",
        pass_confidence: 0.85,
        passed_at: nowIso,
      })
      .eq("run_id", run.id)
      .in("schedule_entry_id", priorStopIds)
      .eq("status", "pending");

    if (bulkError) {
      console.error("confirm-start-stop: bulk mark failed", {
        runId: run.id,
        error: bulkError.message,
      });
      return apiError("INTERNAL_ERROR", "Failed to mark prior stops", 500);
    }
  }

  // Re-fetch stops after update for canonical enforcement
  const { data: updatedStops } = await supabase
    .from("route_run_stops")
    .select("schedule_entry_id, status, schedule_entries!inner(stop_sequence)")
    .eq("run_id", run.id);

  if (updatedStops) {
    updatedStops.sort((a, b) => {
      const sa = (a.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
      const sb = (b.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
      return sa - sb;
    });
  }

  const canonical = enforceCanonicalPrefix(
    (updatedStops ?? []).map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: s.status as "pending" | "passed",
    })),
  );

  // Heal non-contiguous passed rows if needed
  if (canonical.healIds.length > 0) {
    await supabase
      .from("route_run_stops")
      .update({
        status: "pending",
        passed_at: null,
        pass_source: null,
        pass_confidence: null,
      })
      .eq("run_id", run.id)
      .in("schedule_entry_id", canonical.healIds);
  }

  // Persist pointers on route_run
  await supabase
    .from("route_runs")
    .update({
      last_passed_stop_id: canonical.lastPassedStopId,
      next_stop_id: canonical.nextStopId,
      progress_updated_at: nowIso,
    })
    .eq("id", run.id);

  return NextResponse.json({
    confirmed: true,
    nextStopId: canonical.nextStopId,
    lastPassedStopId: canonical.lastPassedStopId,
    passedCount: priorStopIds.length,
  });
}
