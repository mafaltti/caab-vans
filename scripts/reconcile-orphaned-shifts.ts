/**
 * Reconcile orphaned active shifts.
 *
 * Finds route_shifts with ended_at IS NULL that are past their schedule
 * window and have no recent activity, then closes them.
 *
 * Usage:
 *   npx tsx scripts/reconcile-orphaned-shifts.ts
 *   DRY_RUN=1 npx tsx scripts/reconcile-orphaned-shifts.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { isOrphanedShift, SCHEDULE_OVERDUE_MINUTES, INACTIVITY_MINUTES } from "@/lib/tracking/orphaned-shift-health";

const TZ = "America/Bahia";

interface OrphanedShift {
  shiftId: string;
  runId: string;
  routeId: string;
  serviceDate: string;
  scheduledEnd: string;
  lastActivity: string;
}

export async function findOrphanedShifts(
  supabase: SupabaseClient,
  now: DateTime,
): Promise<OrphanedShift[]> {
  // Find all open shifts (ended_at IS NULL)
  const { data: openShifts, error: shiftsError } = await supabase
    .from("route_shifts")
    .select(`
      id,
      run_id,
      started_at,
      route_runs!inner (
        id,
        route_id,
        service_date,
        progress_updated_at,
        routes!inner (
          id,
          van_id,
          schedule_entries (time),
          vans!inner (last_gps_fix_at)
        )
      )
    `)
    .is("ended_at", null);

  if (shiftsError) {
    console.error(JSON.stringify({ event: "reconcile_query_error", error: shiftsError.message }));
    return [];
  }

  if (!openShifts || openShifts.length === 0) {
    return [];
  }

  const orphaned: OrphanedShift[] = [];

  for (const shift of openShifts) {
    const run = shift.route_runs as unknown as {
      id: string;
      route_id: string;
      service_date: string;
      progress_updated_at: string | null;
      routes: {
        id: string;
        van_id: string;
        schedule_entries: { time: string }[];
        vans: { last_gps_fix_at: string | null };
      };
    };

    const route = run.routes;
    const scheduleEntries = route.schedule_entries ?? [];

    if (scheduleEntries.length === 0) continue;

    // Compute scheduled end: service_date + MAX(schedule_entries.time) in America/Bahia
    const maxTime = scheduleEntries
      .map((e) => e.time)
      .sort()
      .at(-1)!;
    const [hour, minute] = maxTime.split(":").map(Number);
    const scheduledEnd = DateTime.fromISO(run.service_date, { zone: TZ })
      .set({ hour, minute, second: 0, millisecond: 0 });

    // Compute last activity: GREATEST of last_gps_fix_at, progress_updated_at, started_at
    const candidates = [
      route.vans.last_gps_fix_at,
      run.progress_updated_at,
      shift.started_at,
    ].filter((t): t is string => t != null);

    const lastActivity = candidates.length > 0
      ? DateTime.max(...candidates.map((t) => DateTime.fromISO(t)))!
      : DateTime.fromISO(shift.started_at);

    // Check closure criteria using shared helper
    if (isOrphanedShift({ scheduledEnd, lastActivity, now })) {
      orphaned.push({
        shiftId: shift.id,
        runId: run.id,
        routeId: run.route_id,
        serviceDate: run.service_date,
        scheduledEnd: scheduledEnd.toISO()!,
        lastActivity: lastActivity.toISO()!,
      });
    }
  }

  return orphaned;
}

export async function closeOrphanedShifts(
  supabase: SupabaseClient,
  shifts: OrphanedShift[],
): Promise<number> {
  if (shifts.length === 0) return 0;

  const shiftIds = shifts.map((s) => s.shiftId);
  const { error } = await supabase
    .from("route_shifts")
    .update({ ended_at: new Date().toISOString() })
    .in("id", shiftIds);

  if (error) {
    console.error(JSON.stringify({ event: "reconcile_close_error", error: error.message, shiftIds }));
    return 0;
  }

  return shifts.length;
}

// --- CLI entrypoint ---

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = DateTime.now().setZone(TZ);
  const dryRun = process.env.DRY_RUN === "1";

  console.log(JSON.stringify({ event: "reconcile_start", dryRun, now: now.toISO() }));

  const orphaned = await findOrphanedShifts(supabase, now);

  if (orphaned.length === 0) {
    console.log(JSON.stringify({ event: "reconcile_done", closedCount: 0 }));
    return;
  }

  console.log(JSON.stringify({ event: "reconcile_candidates", count: orphaned.length, shifts: orphaned }));

  if (dryRun) {
    console.log(JSON.stringify({ event: "reconcile_dry_run", message: "No mutations performed" }));
    return;
  }

  const closedCount = await closeOrphanedShifts(supabase, orphaned);
  console.log(JSON.stringify({ event: "reconcile_done", closedCount }));
}

// Only run when executed directly (not imported by tests)
const isDirectRun =
  process.argv[1]?.replace(/\\/g, "/").includes("reconcile-orphaned-shifts");

if (isDirectRun) {
  main().catch((err) => {
    console.error(JSON.stringify({ event: "reconcile_fatal", error: String(err) }));
    process.exit(1);
  });
}
