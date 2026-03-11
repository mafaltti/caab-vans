import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { reorderScheduleEntriesSchema } from "@/lib/validators/schedule-entry";

type RouteParams = { params: Promise<{ routeId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = reorderScheduleEntriesSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  // Verify all entry IDs belong to this route
  const { data: existing, error: fetchError } = await supabase
    .from("schedule_entries")
    .select("id")
    .eq("route_id", routeId);

  if (fetchError) {
    return apiError("INTERNAL_ERROR", "Failed to fetch schedule entries", 500);
  }

  const existingIds = new Set((existing ?? []).map((e) => e.id));

  if (existingIds.size === 0) {
    return apiError("NOT_FOUND", "Route not found or has no entries", 404);
  }

  const requestedIds = new Set(parsed.data.entryIds);

  // Must contain exactly all entry IDs (no partial reorder, no extras)
  if (requestedIds.size !== existingIds.size) {
    return apiError(
      "VALIDATION_ERROR",
      `Expected ${existingIds.size} entry IDs, got ${requestedIds.size}`,
      400,
    );
  }

  for (const id of requestedIds) {
    if (!existingIds.has(id)) {
      return apiError(
        "VALIDATION_ERROR",
        `Entry ID ${id} does not belong to this route`,
        400,
      );
    }
  }

  // Two-phase reorder to avoid UNIQUE (route_id, stop_sequence) violations.
  // Phase 1: set all sequences to negative offsets (no collisions with positive values)
  const clearUpdates = parsed.data.entryIds.map((id, i) =>
    supabase
      .from("schedule_entries")
      .update({ stop_sequence: -(i + 1) })
      .eq("id", id),
  );

  const clearResults = await Promise.all(clearUpdates);
  const clearFailed = clearResults.find((r) => r.error);
  if (clearFailed?.error) {
    return apiError("INTERNAL_ERROR", "Failed to reorder entries", 500);
  }

  // Phase 2: set final positive sequences
  const finalUpdates = parsed.data.entryIds.map((id, i) =>
    supabase
      .from("schedule_entries")
      .update({ stop_sequence: i + 1 })
      .eq("id", id),
  );

  const finalResults = await Promise.all(finalUpdates);
  const finalFailed = finalResults.find((r) => r.error);
  if (finalFailed?.error) {
    return apiError("INTERNAL_ERROR", "Failed to reorder entries", 500);
  }

  const entries = parsed.data.entryIds.map((id, i) => ({
    id,
    stopSequence: i + 1,
  }));

  return NextResponse.json({ entries });
}
