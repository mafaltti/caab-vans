import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Seed route_run_stops with pending entries for all schedule entries
 * if no stops exist yet for this run. Returns true if seeding occurred.
 */
export async function seedRouteRunStops(
  supabase: SupabaseClient,
  runId: string,
  routeId: string,
): Promise<boolean> {
  const { count: stopCount, error: countError } = await supabase
    .from("route_run_stops")
    .select("*", { count: "exact", head: true })
    .eq("run_id", runId);

  if (countError) {
    console.error("seedRouteRunStops: stop count query failed", {
      runId,
      error: countError.message,
    });
  }

  if (stopCount !== 0) return false;

  const { data: entries, error: entriesError } = await supabase
    .from("schedule_entries")
    .select("id")
    .eq("route_id", routeId);

  if (entriesError) {
    console.error("seedRouteRunStops: schedule_entries lookup failed", {
      routeId,
      error: entriesError.message,
    });
  }

  if (!entries || entries.length === 0) return false;

  const { error: seedError } = await supabase.from("route_run_stops").insert(
    entries.map((e) => ({
      run_id: runId,
      schedule_entry_id: e.id,
      status: "pending",
    })),
  );

  if (seedError) {
    console.error("seedRouteRunStops: stop seeding failed", {
      runId,
      error: seedError.message,
    });
    return false;
  }

  return true;
}
