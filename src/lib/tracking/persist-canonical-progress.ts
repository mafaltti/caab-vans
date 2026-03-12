import { SupabaseClient } from "@supabase/supabase-js";

import {
  enforceCanonicalPrefix,
  type CanonicalPrefixResult,
} from "./enforce-canonical-prefix";

/**
 * Fetch route_run_stops for a run, enforce a contiguous passed prefix,
 * heal non-contiguous rows to pending, and persist progress pointers
 * (last_passed_stop_id, next_stop_id, progress_updated_at) on route_runs.
 */
export async function persistCanonicalProgress(
  supabase: SupabaseClient,
  runId: string,
): Promise<CanonicalPrefixResult> {
  // Fetch all stops for this run, ordered by stop_sequence
  const { data: allStops, error: fetchError } = await supabase
    .from("route_run_stops")
    .select(
      "schedule_entry_id, status, schedule_entries!inner(stop_sequence)",
    )
    .eq("run_id", runId)
    .order("stop_sequence", {
      referencedTable: "schedule_entries",
      ascending: true,
    });

  if (fetchError) {
    console.error("persistCanonicalProgress: fetch failed", {
      runId,
      error: fetchError.message,
    });
    return {
      contiguousPassedIds: new Set(),
      healIds: [],
      lastPassedStopId: null,
      nextStopId: null,
    };
  }

  if (!allStops || allStops.length === 0) {
    return {
      contiguousPassedIds: new Set(),
      healIds: [],
      lastPassedStopId: null,
      nextStopId: null,
    };
  }

  // Belt-and-suspenders: sort in JS too (PostgREST referencedTable caveat)
  allStops.sort((a, b) => {
    const sa = (a.schedule_entries as unknown as { stop_sequence: number })
      .stop_sequence;
    const sb = (b.schedule_entries as unknown as { stop_sequence: number })
      .stop_sequence;
    return sa - sb;
  });

  const canonical = enforceCanonicalPrefix(
    allStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: s.status as "pending" | "passed" | "skipped",
    })),
  );

  // Heal non-contiguous passed rows back to pending
  if (canonical.healIds.length > 0) {
    const { error: healError } = await supabase
      .from("route_run_stops")
      .update({
        status: "pending",
        passed_at: null,
        pass_source: null,
        pass_confidence: null,
      })
      .eq("run_id", runId)
      .in("schedule_entry_id", canonical.healIds);

    if (healError) {
      console.error("persistCanonicalProgress: heal failed", {
        runId,
        healIds: canonical.healIds,
        error: healError.message,
      });
    }
  }

  // Persist progress pointers on the route_run (always — idempotent)
  const { error: pointerError } = await supabase
    .from("route_runs")
    .update({
      last_passed_stop_id: canonical.lastPassedStopId,
      next_stop_id: canonical.nextStopId,
      progress_updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (pointerError) {
    console.error("persistCanonicalProgress: pointer persist failed", {
      runId,
      nextStopId: canonical.nextStopId,
      lastPassedStopId: canonical.lastPassedStopId,
      error: pointerError.message,
    });
  }

  return canonical;
}
