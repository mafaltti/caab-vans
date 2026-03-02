import { SupabaseClient } from "@supabase/supabase-js";

import { nowBahia, todayBahiaDate } from "@/lib/time";

import { haversineDistanceMeters } from "./haversine";

interface StopProgress {
  passedStopIds: string[];
  nextStopId: string | null;
  lastPassedStopId: string | null;
}

const EMPTY_PROGRESS: StopProgress = {
  passedStopIds: [],
  nextStopId: null,
  lastPassedStopId: null,
};

export async function inferStopProgress(
  supabase: SupabaseClient,
  vanId: string,
  lat: number,
  lng: number,
): Promise<StopProgress> {
  // 1. Find route for this van
  const { data: route } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", vanId)
    .single();

  if (!route) return EMPTY_PROGRESS;

  // 2. Today's service date
  const serviceDate = todayBahiaDate();

  // 3. Upsert route_run for (route_id, service_date)
  const { data: run } = await supabase
    .from("route_runs")
    .upsert(
      { route_id: route.id, service_date: serviceDate },
      { onConflict: "route_id,service_date" },
    )
    .select("id")
    .single();

  if (!run) return EMPTY_PROGRESS;

  // 4. Seed route_run_stops on first creation
  const { count: stopCount } = await supabase
    .from("route_run_stops")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run.id);

  if (stopCount === 0) {
    const { data: entries } = await supabase
      .from("schedule_entries")
      .select("id")
      .eq("route_id", route.id);

    if (entries && entries.length > 0) {
      await supabase.from("route_run_stops").insert(
        entries.map((e) => ({
          run_id: run.id,
          schedule_entry_id: e.id,
          status: "pending",
        })),
      );
    }
  }

  // 5. Fetch pending stops with coordinates
  const { data: pendingStops } = await supabase
    .from("route_run_stops")
    .select(
      "schedule_entry_id, status, passed_at, schedule_entries!inner(time, stop_lat, stop_lng, geofence_radius_m)",
    )
    .eq("run_id", run.id)
    .eq("status", "pending")
    .not("schedule_entries.stop_lat", "is", null)
    .not("schedule_entries.stop_lng", "is", null)
    .order("time", { referencedTable: "schedule_entries", ascending: true });

  // 6. Check geofence for each pending stop
  const newlyPassedIds: string[] = [];

  if (pendingStops) {
    for (const stop of pendingStops) {
      const entry = stop.schedule_entries as unknown as {
        time: string;
        stop_lat: number;
        stop_lng: number;
        geofence_radius_m: number;
      };

      const distance = haversineDistanceMeters(
        lat,
        lng,
        entry.stop_lat,
        entry.stop_lng,
      );

      if (distance <= entry.geofence_radius_m) {
        await supabase
          .from("route_run_stops")
          .update({
            status: "passed",
            passed_at: new Date().toISOString(),
          })
          .eq("run_id", run.id)
          .eq("schedule_entry_id", stop.schedule_entry_id);

        newlyPassedIds.push(stop.schedule_entry_id);
      }
    }
  }

  // 7. Build final result from current state
  const { data: allStops } = await supabase
    .from("route_run_stops")
    .select("schedule_entry_id, status, schedule_entries!inner(time)")
    .eq("run_id", run.id)
    .order("time", { referencedTable: "schedule_entries", ascending: true });

  const nowHHmm = nowBahia().toFormat("HH:mm");
  const passedStopIds: string[] = [];
  let nextStopId: string | null = null;
  let lastPassedStopId: string | null = null;

  if (allStops) {
    for (const stop of allStops) {
      if (stop.status === "passed") {
        passedStopIds.push(stop.schedule_entry_id);
        lastPassedStopId = stop.schedule_entry_id;
      } else if (stop.status === "pending" && nextStopId === null) {
        const entry = stop.schedule_entries as unknown as { time: string };
        if (entry.time >= nowHHmm) {
          nextStopId = stop.schedule_entry_id;
        }
      }
    }
  }

  return { passedStopIds, nextStopId, lastPassedStopId };
}
