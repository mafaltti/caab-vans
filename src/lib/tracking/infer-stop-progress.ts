import { SupabaseClient } from "@supabase/supabase-js";

import {
  nowBahia,
  todayBahiaDate,
  parseTime,
  EARLY_ARRIVAL_WINDOW_MINUTES,
} from "@/lib/time";

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
  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", vanId)
    .single();

  if (routeError || !route) {
    if (routeError && routeError.code !== "PGRST116") {
      console.error("inferStopProgress: route lookup failed", { vanId, error: routeError.message });
    }
    return EMPTY_PROGRESS;
  }

  // 2. Today's service date
  const serviceDate = todayBahiaDate();

  // 3. Upsert route_run for (route_id, service_date)
  const { data: run, error: runError } = await supabase
    .from("route_runs")
    .upsert(
      { route_id: route.id, service_date: serviceDate },
      { onConflict: "route_id,service_date" },
    )
    .select("id")
    .single();

  if (runError || !run) {
    console.error("inferStopProgress: route_runs upsert failed", {
      routeId: route.id, vanId, serviceDate, error: runError?.message,
    });
    return EMPTY_PROGRESS;
  }

  // 3b. Gate: require an active shift before seeding/marking stops
  const { data: activeShift, error: activeShiftError } = await supabase
    .from("route_shifts")
    .select("id")
    .eq("run_id", run.id)
    .is("ended_at", null)
    .limit(1)
    .maybeSingle();

  if (activeShiftError) {
    console.error("inferStopProgress: active shift lookup failed", {
      runId: run.id,
      error: activeShiftError.message,
    });
    return EMPTY_PROGRESS;
  }

  if (!activeShift) {
    return EMPTY_PROGRESS;
  }

  // 4. Seed route_run_stops on first creation
  const { count: stopCount, error: countError } = await supabase
    .from("route_run_stops")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run.id);

  if (countError) {
    console.error("inferStopProgress: stop count query failed", {
      runId: run.id, error: countError.message,
    });
  }

  if (stopCount === 0) {
    const { data: entries, error: entriesError } = await supabase
      .from("schedule_entries")
      .select("id")
      .eq("route_id", route.id);

    if (entriesError) {
      console.error("inferStopProgress: schedule_entries lookup failed", {
        routeId: route.id, error: entriesError.message,
      });
    }

    if (entries && entries.length > 0) {
      const { error: seedError } = await supabase.from("route_run_stops").insert(
        entries.map((e) => ({
          run_id: run.id,
          schedule_entry_id: e.id,
          status: "pending",
        })),
      );
      if (seedError) {
        console.error("inferStopProgress: stop seeding failed", {
          runId: run.id, error: seedError.message,
        });
      }
    }
  }

  // 5. Fetch pending stops with coordinates
  const { data: pendingStops, error: pendingError } = await supabase
    .from("route_run_stops")
    .select(
      "schedule_entry_id, status, passed_at, schedule_entries!inner(time, stop_lat, stop_lng, geofence_radius_m)",
    )
    .eq("run_id", run.id)
    .eq("status", "pending")
    .not("schedule_entries.stop_lat", "is", null)
    .not("schedule_entries.stop_lng", "is", null)
    .order("time", { referencedTable: "schedule_entries", ascending: true });

  if (pendingError) {
    console.error("inferStopProgress: pending stops query failed", {
      runId: run.id, error: pendingError.message,
    });
  }

  // 6. Check geofence for each pending stop — closest-in-time matching
  const newlyPassedIds: string[] = [];
  const now = nowBahia();

  if (pendingStops) {
    // Group pending stops by coordinate key
    const coordGroups = new Map<string, typeof pendingStops>();
    for (const stop of pendingStops) {
      const entry = stop.schedule_entries as unknown as {
        time: string;
        stop_lat: number;
        stop_lng: number;
        geofence_radius_m: number;
      };
      const coordKey = `${entry.stop_lat.toFixed(6)},${entry.stop_lng.toFixed(6)}`;
      if (!coordGroups.has(coordKey)) coordGroups.set(coordKey, []);
      coordGroups.get(coordKey)!.push(stop);
    }

    // For each coordinate group: check geofence, then pick closest-in-time
    for (const [, group] of coordGroups) {
      const firstEntry = group[0].schedule_entries as unknown as {
        time: string;
        stop_lat: number;
        stop_lng: number;
        geofence_radius_m: number;
      };

      // Geofence check (same coords for all in group)
      const distance = haversineDistanceMeters(
        lat,
        lng,
        firstEntry.stop_lat,
        firstEntry.stop_lng,
      );
      if (distance > firstEntry.geofence_radius_m) continue;

      // Filter by early arrival window
      const eligible = group.filter((stop) => {
        const entry = stop.schedule_entries as unknown as { time: string };
        const stopTime = parseTime(entry.time);
        return now >= stopTime.minus({ minutes: EARLY_ARRIVAL_WINDOW_MINUTES });
      });
      if (eligible.length === 0) continue;

      // Pick stop with smallest |time - now|
      let bestStop = eligible[0];
      let bestDiff = Math.abs(
        parseTime(
          (bestStop.schedule_entries as unknown as { time: string }).time,
        ).diff(now, "minutes").minutes,
      );
      for (let i = 1; i < eligible.length; i++) {
        const entry = eligible[i].schedule_entries as unknown as {
          time: string;
        };
        const diff = Math.abs(
          parseTime(entry.time).diff(now, "minutes").minutes,
        );
        if (diff < bestDiff) {
          bestStop = eligible[i];
          bestDiff = diff;
        }
      }

      // Mark as passed
      await supabase
        .from("route_run_stops")
        .update({ status: "passed", passed_at: new Date().toISOString() })
        .eq("run_id", run.id)
        .eq("schedule_entry_id", bestStop.schedule_entry_id);

      newlyPassedIds.push(bestStop.schedule_entry_id);
    }
  }

  // 6b. Chronological backfill: mark all earlier pending stops as passed
  if (newlyPassedIds.length > 0 && pendingStops) {
    // Find the max scheduled time among newly passed stops
    let maxPassedTime = "";
    for (const stop of pendingStops) {
      if (newlyPassedIds.includes(stop.schedule_entry_id)) {
        const entry = stop.schedule_entries as unknown as { time: string };
        if (entry.time > maxPassedTime) maxPassedTime = entry.time;
      }
    }

    // Collect IDs of pending stops with time < maxPassedTime that weren't already matched
    const backfillIds: string[] = [];
    for (const stop of pendingStops) {
      if (newlyPassedIds.includes(stop.schedule_entry_id)) continue;
      const entry = stop.schedule_entries as unknown as { time: string };
      if (entry.time < maxPassedTime) {
        backfillIds.push(stop.schedule_entry_id);
      }
    }

    if (backfillIds.length > 0) {
      await supabase
        .from("route_run_stops")
        .update({ status: "passed", passed_at: new Date().toISOString() })
        .eq("run_id", run.id)
        .in("schedule_entry_id", backfillIds);
    }
  }

  // 7. Build final result from current state
  const { data: allStops, error: allStopsError } = await supabase
    .from("route_run_stops")
    .select("schedule_entry_id, status, schedule_entries!inner(time)")
    .eq("run_id", run.id)
    .order("time", { referencedTable: "schedule_entries", ascending: true });

  if (allStopsError) {
    console.error("inferStopProgress: allStops query failed", {
      runId: run.id, error: allStopsError.message,
    });
  }

  // Time floor: use current time (shifts track start separately)
  const timeFloor = nowBahia().toFormat("HH:mm");
  const passedStopIds: string[] = [];
  let nextStopId: string | null = null;
  let firstPendingId: string | null = null;
  let lastPassedStopId: string | null = null;

  if (allStops) {
    for (const stop of allStops) {
      if (stop.status === "passed") {
        passedStopIds.push(stop.schedule_entry_id);
        lastPassedStopId = stop.schedule_entry_id;
      } else if (stop.status === "pending") {
        if (firstPendingId === null) firstPendingId = stop.schedule_entry_id;
        if (nextStopId === null) {
          const entry = stop.schedule_entries as unknown as { time: string };
          if (entry.time >= timeFloor) {
            nextStopId = stop.schedule_entry_id;
          }
        }
      }
    }
    // Fallback: if all pending stops are overdue, use the first pending stop
    if (nextStopId === null && firstPendingId !== null) {
      nextStopId = firstPendingId;
    }
  }

  return { passedStopIds, nextStopId, lastPassedStopId };
}
