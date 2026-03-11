/**
 * One-time reconciliation script for active route runs.
 *
 * Seeds missing route_run_stops and re-persists canonical progress pointers
 * for all active runs (open shifts on current service date).
 *
 * Usage:
 *   npx tsx scripts/reconcile-active-runs.ts
 *   DRY_RUN=1 npx tsx scripts/reconcile-active-runs.ts
 */

import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { persistCanonicalProgress } from "@/lib/tracking/persist-canonical-progress";
import { seedRouteRunStops } from "@/lib/tracking/seed-route-run-stops";

const TZ = "America/Bahia";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = DateTime.now().setZone(TZ);
  const serviceDate = now.toFormat("yyyy-MM-dd");
  const dryRun = process.env.DRY_RUN === "1";

  console.log(JSON.stringify({
    event: "reconcile_active_runs_start",
    serviceDate,
    dryRun,
  }));

  // Find active runs: route_runs with an open shift on today's service date
  const { data: activeRuns, error: runsError } = await supabase
    .from("route_runs")
    .select("id, route_id, service_date, route_shifts!inner(id)")
    .eq("service_date", serviceDate)
    .is("route_shifts.ended_at", null);

  if (runsError) {
    console.error("Failed to query active runs:", runsError.message);
    process.exit(1);
  }

  if (!activeRuns || activeRuns.length === 0) {
    console.log(JSON.stringify({
      event: "reconcile_active_runs_done",
      candidates: 0,
      repaired: 0,
    }));
    return;
  }

  console.log(JSON.stringify({
    event: "reconcile_active_runs_candidates",
    count: activeRuns.length,
    runIds: activeRuns.map((r) => r.id),
  }));

  if (dryRun) {
    console.log(JSON.stringify({ event: "reconcile_active_runs_dry_run" }));
    return;
  }

  let repaired = 0;
  for (const run of activeRuns) {
    try {
      const seeded = await seedRouteRunStops(supabase, run.id, run.route_id);
      const result = await persistCanonicalProgress(supabase, run.id);

      console.log(JSON.stringify({
        event: "reconcile_active_run_repaired",
        runId: run.id,
        routeId: run.route_id,
        seeded,
        nextStopId: result.nextStopId,
        lastPassedStopId: result.lastPassedStopId,
        healedCount: result.healIds.length,
      }));
      repaired++;
    } catch (err) {
      console.error(JSON.stringify({
        event: "reconcile_active_run_error",
        runId: run.id,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  console.log(JSON.stringify({
    event: "reconcile_active_runs_done",
    candidates: activeRuns.length,
    repaired,
  }));
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
