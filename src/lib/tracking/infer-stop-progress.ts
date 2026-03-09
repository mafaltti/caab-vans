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

export const SNAP_DISPLACEMENT_THRESHOLD_M = 50;
export const CONFIDENCE_PING_WINDOW_MINUTES = 5;
export const SNAP_LOW_DISPLACEMENT_THRESHOLD_M = 15;

export async function inferStopProgress(
  supabase: SupabaseClient,
  vanId: string,
  lat: number,
  lng: number,
  snappedLat?: number | null,
  snappedLng?: number | null,
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
      "schedule_entry_id, status, passed_at, schedule_entries!inner(time, stop_lat, stop_lng, geofence_radius_m, stop_group_id)",
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

  // 6. Determine snap eligibility (gate only — per-stop decision deferred)
  const hasSnapped = snappedLat != null && snappedLng != null;
  let snapEligible = false;

  if (hasSnapped) {
    const snapDisplacement = haversineDistanceMeters(
      lat, lng, snappedLat!, snappedLng!,
    );
    snapEligible = snapDisplacement <= SNAP_DISPLACEMENT_THRESHOLD_M;
  }

  // Check geofence for each pending stop — closest-in-time matching
  const newlyPassedIds: string[] = [];
  const newlyPassedConfidence = new Map<string, number>();
  const perStopSnap = new Map<string, boolean>();
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
        stop_group_id: string | null;
      };
      const coordKey = entry.stop_group_id ?? `${entry.stop_lat.toFixed(6)},${entry.stop_lng.toFixed(6)}`;
      if (!coordGroups.has(coordKey)) coordGroups.set(coordKey, []);
      coordGroups.get(coordKey)!.push(stop);
    }

    // Pre-fetch recent pings once for confidence scoring across all groups
    const windowStart = new Date(
      Date.now() - CONFIDENCE_PING_WINDOW_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: allRecentPings } = await supabase
      .from("van_location_pings")
      .select("lat, lng")
      .eq("van_id", vanId)
      .gte("device_ts", windowStart)
      .order("device_ts", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);

    // For each group: check geofence per entry, then pick closest-in-time
    for (const [, group] of coordGroups) {
      // Filter entries within their individual geofence AND early arrival window
      // Per-stop snap decision: use whichever coordinate is closer
      const eligible = group.filter((stop) => {
        const entry = stop.schedule_entries as unknown as {
          time: string;
          stop_lat: number;
          stop_lng: number;
          geofence_radius_m: number;
        };
        const rawDist = haversineDistanceMeters(lat, lng, entry.stop_lat, entry.stop_lng);
        let distance: number;
        let useSnappedForThisStop = false;

        if (snapEligible) {
          const snappedDist = haversineDistanceMeters(snappedLat!, snappedLng!, entry.stop_lat, entry.stop_lng);
          if (snappedDist < rawDist) {
            distance = snappedDist;
            useSnappedForThisStop = true;
          } else {
            distance = rawDist;
          }
        } else {
          distance = rawDist;
        }

        perStopSnap.set(stop.schedule_entry_id, useSnappedForThisStop);

        if (distance > entry.geofence_radius_m) return false;
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

      // Compute confidence score based on recent pings in geofence
      const bestEntry = bestStop.schedule_entries as unknown as {
        stop_lat: number; stop_lng: number; geofence_radius_m: number;
      };

      let pingsInGeofence = 0;
      if (allRecentPings) {
        for (const ping of allRecentPings) {
          const pingDist = haversineDistanceMeters(
            ping.lat, ping.lng,
            bestEntry.stop_lat, bestEntry.stop_lng,
          );
          if (pingDist <= bestEntry.geofence_radius_m) {
            pingsInGeofence++;
          }
        }
      }

      const useSnappedForThisStop = perStopSnap.get(bestStop.schedule_entry_id) ?? false;

      let confidence: number;
      if (useSnappedForThisStop) {
        // Tiered snapped confidence: base depends on raw position
        const rawDist = haversineDistanceMeters(lat, lng, bestEntry.stop_lat, bestEntry.stop_lng);
        const rawInsideGeofence = rawDist <= bestEntry.geofence_radius_m;
        confidence = rawInsideGeofence ? 0.85 : 0.65;

        // Bonus: 2+ confirming pings in geofence
        if (pingsInGeofence >= 2) {
          confidence += 0.10;
        }

        // Bonus: snap displacement ≤15m
        const snapDisp = haversineDistanceMeters(lat, lng, snappedLat!, snappedLng!);
        if (snapDisp <= SNAP_LOW_DISPLACEMENT_THRESHOLD_M) {
          confidence += 0.05;
        }

        // Cap at 0.95 and round to avoid floating-point artifacts
        confidence = Math.round(Math.min(confidence, 0.95) * 100) / 100;
      } else {
        // Raw confidence unchanged
        confidence = pingsInGeofence >= 2 ? 0.90 : 0.70;
      }

      const passSource = useSnappedForThisStop ? "geofence_snapped" : "geofence_raw";

      // Mark as passed with confidence metadata
      const { error: geofenceError } = await supabase
        .from("route_run_stops")
        .update({
          status: "passed",
          passed_at: new Date().toISOString(),
          pass_source: passSource,
          pass_confidence: confidence,
        })
        .eq("run_id", run.id)
        .eq("schedule_entry_id", bestStop.schedule_entry_id);

      if (geofenceError) {
        console.error("inferStopProgress: geofence mark failed", {
          runId: run.id,
          scheduleEntryId: bestStop.schedule_entry_id,
          error: geofenceError.message,
        });
        continue;
      }

      newlyPassedIds.push(bestStop.schedule_entry_id);
      newlyPassedConfidence.set(bestStop.schedule_entry_id, confidence);
    }
  }

  // 6b. Confidence-gated chronological backfill
  if (newlyPassedIds.length > 0 && pendingStops) {
    // Find the max scheduled time and confidence among newly passed stops
    let maxPassedTime = "";
    let maxPassedConfidence = 0;
    for (const stop of pendingStops) {
      if (newlyPassedIds.includes(stop.schedule_entry_id)) {
        const entry = stop.schedule_entries as unknown as { time: string };
        if (entry.time > maxPassedTime) maxPassedTime = entry.time;
        const conf = newlyPassedConfidence.get(stop.schedule_entry_id) ?? 0;
        if (conf > maxPassedConfidence) maxPassedConfidence = conf;
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
      const gap = backfillIds.length;
      // Gate: only backfill if confidence > 0.7 (requires multi-ping raw match)
      const shouldBackfill = maxPassedConfidence > 0.7;

      if (shouldBackfill) {
        let backfillConfidence: number;
        if (gap <= 1) {
          backfillConfidence = 0.7;
        } else if (gap <= 3) {
          backfillConfidence = 0.5;
        } else {
          backfillConfidence = 0.3;
        }

        const { error: backfillError } = await supabase
          .from("route_run_stops")
          .update({
            status: "passed",
            passed_at: new Date().toISOString(),
            pass_source: "backfill",
            pass_confidence: backfillConfidence,
          })
          .eq("run_id", run.id)
          .in("schedule_entry_id", backfillIds);

        if (backfillError) {
          console.error("inferStopProgress: backfill mark failed", {
            runId: run.id,
            backfillIds,
            error: backfillError.message,
          });
        }
      }
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

  const passedStopIds: string[] = [];
  let nextStopId: string | null = null;
  let lastPassedStopId: string | null = null;

  if (allStops) {
    for (const stop of allStops) {
      if (stop.status === "passed") {
        passedStopIds.push(stop.schedule_entry_id);
        lastPassedStopId = stop.schedule_entry_id;
      } else if (stop.status === "pending") {
        // Always use the first pending stop chronologically — including overdue
        // stops. The read path (resolve-route-progress) trusts this pointer and
        // computes ETA for it, so skipping overdue stops would break the cutover.
        if (nextStopId === null) {
          nextStopId = stop.schedule_entry_id;
        }
      }
    }
  }

  // Adjacency validation: if lastPassedStopId is not adjacent to nextStopId
  // (pending stops exist between them), roll back to the last contiguously-passed stop.
  if (allStops && lastPassedStopId !== null && nextStopId !== null) {
    const lastPassedIdx = allStops.findIndex(
      (s) => s.schedule_entry_id === lastPassedStopId,
    );
    const nextPendingIdx = allStops.findIndex(
      (s) => s.schedule_entry_id === nextStopId,
    );

    if (lastPassedIdx >= 0 && nextPendingIdx >= 0 && lastPassedIdx + 1 !== nextPendingIdx) {
      // Walk from the beginning: find the last passed stop before the first pending gap
      let contiguousLastPassed: string | null = null;
      for (let i = 0; i < allStops.length; i++) {
        if (allStops[i].status === "passed") {
          contiguousLastPassed = allStops[i].schedule_entry_id;
        } else {
          // First pending stop — the contiguous chain ends here
          break;
        }
      }
      lastPassedStopId = contiguousLastPassed;
      // Filter passedStopIds to the contiguous prefix so downstream
      // consumers (map, timeline, passed count) stay consistent.
      const contiguousSet = new Set<string>();
      for (const stop of allStops) {
        if (stop.status === "passed") {
          contiguousSet.add(stop.schedule_entry_id);
        } else {
          break;
        }
      }
      passedStopIds.length = 0;
      passedStopIds.push(...contiguousSet);
    }
  }

  // Persist progress pointers on the route_run
  if (lastPassedStopId !== null || nextStopId !== null) {
    const { error: pointerError } = await supabase
      .from("route_runs")
      .update({
        last_passed_stop_id: lastPassedStopId,
        next_stop_id: nextStopId,
        progress_updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    if (pointerError) {
      console.error("inferStopProgress: pointer persist failed", {
        runId: run.id,
        routeId: route.id,
        serviceDate,
        nextStopId,
        lastPassedStopId,
        error: pointerError.message,
      });
    }
  }

  return { passedStopIds, nextStopId, lastPassedStopId };
}
