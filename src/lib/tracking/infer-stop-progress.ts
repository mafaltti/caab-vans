import { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { EARLY_ARRIVAL_WINDOW_MINUTES } from "@/lib/time";

import { chooseEffectivePosition } from "./effective-position";
import { enforceCanonicalPrefix } from "./enforce-canonical-prefix";
import { haversineDistanceMeters } from "./haversine";
import { seedRouteRunStops } from "./seed-route-run-stops";

const TZ = "America/Bahia";

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

export async function inferStopProgress(args: {
  supabase: SupabaseClient;
  vanId: string;
  rawLat: number;
  rawLng: number;
  snappedLat?: number | null;
  snappedLng?: number | null;
  eventTs: string;
}): Promise<StopProgress> {
  const { supabase, vanId, rawLat, rawLng, snappedLat, snappedLng, eventTs } = args;

  // Derive event time and service date from eventTs
  const eventTime = DateTime.fromISO(eventTs).setZone(TZ);
  const serviceDate = eventTime.toFormat("yyyy-MM-dd");

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

  // 2. Upsert route_run for (route_id, service_date)
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

  // 3. Gate: require a shift active at eventTs
  const { data: activeShift, error: activeShiftError } = await supabase
    .from("route_shifts")
    .select("id")
    .eq("run_id", run.id)
    .lte("started_at", eventTs)
    .or(`ended_at.is.null,ended_at.gt.${eventTs}`)
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
  await seedRouteRunStops(supabase, run.id, route.id);

  // 5. Fetch pending stops with coordinates
  const { data: pendingStops, error: pendingError } = await supabase
    .from("route_run_stops")
    .select(
      "schedule_entry_id, status, passed_at, schedule_entries!inner(stop_lat, stop_lng, geofence_radius_m, stop_group_id, stop_sequence, arrival_time, departure_time)",
    )
    .eq("run_id", run.id)
    .eq("status", "pending")
    .not("schedule_entries.stop_lat", "is", null)
    .not("schedule_entries.stop_lng", "is", null)
    .order("stop_sequence", { referencedTable: "schedule_entries", ascending: true });

  // PostgREST referencedTable .order() only sorts the embedded sub-object,
  // not the parent rows. Sort in JS to guarantee chronological iteration.
  if (pendingStops) {
    pendingStops.sort((a, b) => {
      const sa = (a.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
      const sb = (b.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
      return sa - sb;
    });
  }

  if (pendingError) {
    console.error("inferStopProgress: pending stops query failed", {
      runId: run.id, error: pendingError.message,
    });
  }

  // Check geofence for each pending stop — closest-in-time matching
  const newlyPassedIds: string[] = [];
  const newlyPassedConfidence = new Map<string, number>();
  const perStopSnap = new Map<string, boolean>();

  // Helper: build a DateTime from HH:mm anchored to eventTime's date
  function stopDateTime(hhMm: string): DateTime {
    const [hour, minute] = hhMm.split(":").map(Number);
    return eventTime.set({ hour, minute, second: 0, millisecond: 0 });
  }

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
        stop_sequence: number;
        arrival_time: string;
        departure_time: string;
      };
      const coordKey = entry.stop_group_id ?? `${entry.stop_lat.toFixed(6)},${entry.stop_lng.toFixed(6)}`;
      if (!coordGroups.has(coordKey)) coordGroups.set(coordKey, []);
      coordGroups.get(coordKey)!.push(stop);
    }

    // Pre-fetch recent pings once for confidence scoring across all groups
    const windowStart = new Date(
      new Date(eventTs).getTime() - CONFIDENCE_PING_WINDOW_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: allRecentPings } = await supabase
      .from("van_location_pings")
      .select("lat, lng, snapped_lat, snapped_lng")
      .eq("van_id", vanId)
      .gte("device_ts", windowStart)
      .lte("device_ts", eventTs)
      .order("device_ts", { ascending: false })
      .order("id", { ascending: false });

    // For each group: check geofence per entry, then pick closest-in-time
    for (const [, group] of coordGroups) {
      // Filter entries within their individual geofence AND early arrival window
      // Per-stop position decision via shared helper
      const eligible = group.filter((stop) => {
        const entry = stop.schedule_entries as unknown as {
          time: string;
          stop_lat: number;
          stop_lng: number;
          geofence_radius_m: number;
          arrival_time: string;
          departure_time: string;
        };
        const effectivePos = chooseEffectivePosition({
          rawLat,
          rawLng,
          snappedLat: snappedLat ?? null,
          snappedLng: snappedLng ?? null,
          targetLat: entry.stop_lat,
          targetLng: entry.stop_lng,
          snapDisplacementThreshold: SNAP_DISPLACEMENT_THRESHOLD_M,
        });
        const distance = haversineDistanceMeters(effectivePos.lat, effectivePos.lng, entry.stop_lat, entry.stop_lng);
        const useSnappedForThisStop = effectivePos.source === "snapped";

        perStopSnap.set(stop.schedule_entry_id, useSnappedForThisStop);

        if (distance > entry.geofence_radius_m) return false;
        const stopTime = stopDateTime(entry.arrival_time);
        return eventTime >= stopTime.minus({ minutes: EARLY_ARRIVAL_WINDOW_MINUTES });
      });
      if (eligible.length === 0) continue;

      // Pick stop with smallest |time - eventTime| (using arrival_time for proximity)
      let bestStop = eligible[0];
      let bestDiff = Math.abs(
        stopDateTime(
          (bestStop.schedule_entries as unknown as { arrival_time: string }).arrival_time,
        ).diff(eventTime, "minutes").minutes,
      );
      for (let i = 1; i < eligible.length; i++) {
        const entry = eligible[i].schedule_entries as unknown as {
          arrival_time: string;
        };
        const diff = Math.abs(
          stopDateTime(entry.arrival_time).diff(eventTime, "minutes").minutes,
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

      const useSnappedForThisStop = perStopSnap.get(bestStop.schedule_entry_id) ?? false;

      let pingsInGeofence = 0;
      if (allRecentPings) {
        for (const ping of allRecentPings) {
          let pingLat: number;
          let pingLng: number;

          if (useSnappedForThisStop) {
            // Snapped-triggered match: only count pings with stored snapped coords
            if (ping.snapped_lat == null || ping.snapped_lng == null) continue;
            pingLat = ping.snapped_lat;
            pingLng = ping.snapped_lng;
          } else {
            // Raw-triggered match: count using raw coords
            pingLat = ping.lat;
            pingLng = ping.lng;
          }

          const pingDist = haversineDistanceMeters(
            pingLat, pingLng,
            bestEntry.stop_lat, bestEntry.stop_lng,
          );
          if (pingDist <= bestEntry.geofence_radius_m) {
            pingsInGeofence++;
          }
        }
      }

      let confidence: number;
      if (useSnappedForThisStop) {
        // Tiered snapped confidence: base depends on raw position
        const rawDist = haversineDistanceMeters(rawLat, rawLng, bestEntry.stop_lat, bestEntry.stop_lng);
        const rawInsideGeofence = rawDist <= bestEntry.geofence_radius_m;
        confidence = rawInsideGeofence ? 0.85 : 0.65;

        // Bonus: 2+ confirming pings in geofence
        if (pingsInGeofence >= 2) {
          confidence += 0.10;
        }

        // Bonus: snap displacement ≤15m
        const snapDisp = haversineDistanceMeters(rawLat, rawLng, snappedLat!, snappedLng!);
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

      // Mark as passed with confidence metadata — use eventTs for passed_at
      const { error: geofenceError } = await supabase
        .from("route_run_stops")
        .update({
          status: "passed",
          passed_at: eventTs,
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
    // Find the max stop_sequence and confidence among newly passed stops
    let maxPassedSeq = -1;
    let maxPassedConfidence = 0;
    for (const stop of pendingStops) {
      if (newlyPassedIds.includes(stop.schedule_entry_id)) {
        const entry = stop.schedule_entries as unknown as { stop_sequence: number };
        if (entry.stop_sequence > maxPassedSeq) maxPassedSeq = entry.stop_sequence;
        const conf = newlyPassedConfidence.get(stop.schedule_entry_id) ?? 0;
        if (conf > maxPassedConfidence) maxPassedConfidence = conf;
      }
    }

    // Collect IDs of pending stops with stop_sequence < maxPassedSeq that weren't already matched
    const backfillIds: string[] = [];
    for (const stop of pendingStops) {
      if (newlyPassedIds.includes(stop.schedule_entry_id)) continue;
      const entry = stop.schedule_entries as unknown as { stop_sequence: number };
      if (entry.stop_sequence < maxPassedSeq) {
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
            passed_at: eventTs,
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
    .select("schedule_entry_id, status, schedule_entries!inner(stop_sequence)")
    .eq("run_id", run.id)
    .order("stop_sequence", { referencedTable: "schedule_entries", ascending: true });

  // Same PostgREST caveat — sort parent rows by stop_sequence in JS.
  if (allStops) {
    allStops.sort((a, b) => {
      const sa = (a.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
      const sb = (b.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
      return sa - sb;
    });
  }

  if (allStopsError) {
    console.error("inferStopProgress: allStops query failed", {
      runId: run.id, error: allStopsError.message,
    });
  }

  // 7b. Canonical write enforcement: only a contiguous passed prefix is valid.
  // Walk from route start, keep only contiguous passed stops, heal the rest.
  const passedStopIds: string[] = [];
  let nextStopId: string | null = null;
  let lastPassedStopId: string | null = null;

  if (allStops) {
    const canonical = enforceCanonicalPrefix(
      allStops.map((s) => ({
        schedule_entry_id: s.schedule_entry_id,
        status: s.status as "pending" | "passed" | "skipped",
      })),
    );

    // Revert non-contiguous passed rows to pending in the DB
    if (canonical.healIds.length > 0) {
      const { error: healError } = await supabase
        .from("route_run_stops")
        .update({
          status: "pending",
          passed_at: null,
          pass_source: null,
          pass_confidence: null,
        })
        .eq("run_id", run.id)
        .in("schedule_entry_id", canonical.healIds);

      if (healError) {
        console.error("inferStopProgress: canonical heal failed", {
          runId: run.id, healIds: canonical.healIds, error: healError.message,
        });
      }
    }

    // Build result from canonical prefix
    passedStopIds.push(...canonical.contiguousPassedIds);
    lastPassedStopId = canonical.lastPassedStopId;
    nextStopId = canonical.nextStopId;
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
