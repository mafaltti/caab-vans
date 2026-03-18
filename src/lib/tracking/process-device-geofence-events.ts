import { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { EARLY_ARRIVAL_WINDOW_MINUTES } from "@/lib/time";

import { persistCanonicalProgress } from "./persist-canonical-progress";
import { seedRouteRunStops } from "./seed-route-run-stops";

const TZ = "America/Bahia";

export async function processDeviceGeofenceEvents(args: {
  supabase: SupabaseClient;
  vanId: string;
  geofenceEvents: { placeId: string; enteredAt: number; eventId: string }[];
}): Promise<string[]> {
  const { supabase, vanId, geofenceEvents } = args;
  const tentativeMatchIds: string[] = [];

  for (const event of geofenceEvents) {
    try {
      await processOneEvent(supabase, vanId, event, tentativeMatchIds);
    } catch (err) {
      console.error("processDeviceGeofenceEvents: unexpected error", {
        vanId,
        eventId: event.eventId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  // Cascade: when new stops pass, previously deferred events may now be
  // head-of-line.  Re-evaluate until no more resolve (bounded to avoid loops).
  if (tentativeMatchIds.length > 0) {
    const cascadeIds = await replayDeferredEvents({ supabase, vanId });
    tentativeMatchIds.push(...cascadeIds);
  }

  return tentativeMatchIds;
}

/**
 * Re-evaluate all deferred geofence events for a van.  Call this whenever
 * the head-of-line stop changes (geofence match, skip-stop, manual pass, etc.)
 * so that previously out-of-order events get a chance to resolve.
 */
export async function replayDeferredEvents(args: {
  supabase: SupabaseClient;
  vanId: string;
}): Promise<string[]> {
  const { supabase, vanId } = args;
  const matchedIds: string[] = [];
  const MAX_CASCADE_ROUNDS = 5;

  for (let round = 0; round < MAX_CASCADE_ROUNDS; round++) {
    const { data: deferredEvents } = await supabase
      .from("tracking_geofence_events")
      .select("event_id, place_id, entered_at")
      .eq("van_id", vanId)
      .eq("status", "deferred")
      .order("entered_at", { ascending: true });

    if (!deferredEvents || deferredEvents.length === 0) break;

    const prevCount = matchedIds.length;
    for (const evt of deferredEvents) {
      try {
        await processOneEvent(supabase, vanId, {
          placeId: evt.place_id,
          enteredAt: new Date(evt.entered_at).getTime(),
          eventId: evt.event_id,
        }, matchedIds);
      } catch (err) {
        console.error("replayDeferredEvents: cascade error", {
          vanId, eventId: evt.event_id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    if (matchedIds.length === prevCount) break;
  }

  return matchedIds;
}

async function processOneEvent(
  supabase: SupabaseClient,
  vanId: string,
  event: { placeId: string; enteredAt: number; eventId: string },
  tentativeMatchIds: string[],
) {
  const { placeId, enteredAt, eventId } = event;
  const eventTs = new Date(enteredAt).toISOString();
  const eventTime = DateTime.fromMillis(enteredAt).setZone(TZ);
  const serviceDate = eventTime.toFormat("yyyy-MM-dd");

  // 1. Insert into tracking_geofence_events (dedup via ON CONFLICT)
  const { data: inserted, error: insertError } = await supabase
    .from("tracking_geofence_events")
    .upsert(
      { van_id: vanId, event_id: eventId, place_id: placeId, entered_at: eventTs },
      { onConflict: "van_id,event_id", ignoreDuplicates: true },
    )
    .select("id");

  if (insertError) {
    console.error("processDeviceGeofenceEvents: insert failed", {
      vanId, eventId, error: insertError.message,
    });
    return;
  }

  const isNewEvent = inserted && inserted.length > 0;

  // For duplicate events, check existing row state to decide whether to re-process
  if (!isNewEvent) {
    const { data: existing } = await supabase
      .from("tracking_geofence_events")
      .select("status, matched_schedule_entry_id, matched_run_id")
      .eq("van_id", vanId)
      .eq("event_id", eventId)
      .single();

    if (!existing) return;

    // no_match / deferred events are re-processable: shift may have started,
    // transient failures may have resolved, or earlier stops may have passed.
    // Reset to 'received' and fall through.
    if (existing.status === "no_match" || existing.status === "deferred") {
      await supabase
        .from("tracking_geofence_events")
        .update({ status: "received" })
        .eq("van_id", vanId)
        .eq("event_id", eventId);
    }

    // awaiting_corroboration events are waiting for GPS confirmation —
    // do not re-process; evaluatePendingCorroborations() handles them.
    if (existing.status === "awaiting_corroboration") return;

    if (existing.status === "matched" && existing.matched_schedule_entry_id && existing.matched_run_id) {
      // Check if matched stop is still passed — if so, already resolved
      const { data: matchedStop } = await supabase
        .from("route_run_stops")
        .select("status")
        .eq("run_id", existing.matched_run_id)
        .eq("schedule_entry_id", existing.matched_schedule_entry_id)
        .single();

      if (matchedStop?.status === "passed") {
        tentativeMatchIds.push(eventId);
        return; // Already resolved, skip
      }
      // Stop was healed back to pending — fall through to re-process
    }
    // status='received' (partial failure) — fall through to re-process
  }

  // 2. Route/run lookup
  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", vanId)
    .single();

  if (routeError || !route) {
    if (routeError && routeError.code !== "PGRST116") {
      console.error("processDeviceGeofenceEvents: route lookup failed", {
        vanId, error: routeError.message,
      });
    }
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  const { data: run, error: runError } = await supabase
    .from("route_runs")
    .upsert(
      { route_id: route.id, service_date: serviceDate },
      { onConflict: "route_id,service_date" },
    )
    .select("id")
    .single();

  if (runError || !run) {
    console.error("processDeviceGeofenceEvents: route_runs upsert failed", {
      routeId: route.id, vanId, serviceDate, error: runError?.message,
    });
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  // 3. Shift gate
  const { data: activeShift, error: shiftError } = await supabase
    .from("route_shifts")
    .select("id")
    .eq("run_id", run.id)
    .lte("started_at", eventTs)
    .or(`ended_at.is.null,ended_at.gt.${eventTs}`)
    .limit(1)
    .maybeSingle();

  if (shiftError) {
    console.error("processDeviceGeofenceEvents: shift lookup failed", {
      runId: run.id, error: shiftError.message,
    });
  }

  if (!activeShift) {
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  // 4. Seed route_run_stops
  await seedRouteRunStops(supabase, run.id, route.id);

  // 5. Resolve placeId to pending stops (includes ungeocoded stops for ordering)
  const { data: allPendingStops, error: pendingError } = await supabase
    .from("route_run_stops")
    .select(
      "schedule_entry_id, schedule_entries!inner(stop_lat, stop_lng, stop_group_id, geofence_radius_m, stop_sequence, arrival_time, departure_time)",
    )
    .eq("run_id", run.id)
    .eq("status", "pending");

  if (pendingError) {
    console.error("processDeviceGeofenceEvents: pending stops query failed", {
      runId: run.id, error: pendingError.message,
    });
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  if (!allPendingStops || allPendingStops.length === 0) {
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  // Sort by stop_sequence
  allPendingStops.sort((a, b) => {
    const sa = (a.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
    const sb = (b.schedule_entries as unknown as { stop_sequence: number }).stop_sequence;
    return sa - sb;
  });

  // Match by placeId + early arrival window, then pick closest-in-time
  type StopEntry = {
    stop_lat: number;
    stop_lng: number;
    stop_group_id: string | null;
    geofence_radius_m: number;
    stop_sequence: number;
    arrival_time: string;
    departure_time: string;
  };

  // Filter to geocoded stops only for geofence matching
  const pendingStops = allPendingStops.filter((s) => {
    const entry = s.schedule_entries as unknown as StopEntry;
    return entry.stop_lat != null && entry.stop_lng != null;
  });

  if (pendingStops.length === 0) {
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  function stopDateTime(hhMm: string): DateTime {
    const [hour, minute] = hhMm.split(":").map(Number);
    return eventTime.set({ hour, minute, second: 0, millisecond: 0 });
  }

  const eligible: { scheduleEntryId: string; entry: StopEntry; diff: number }[] = [];

  for (const stop of pendingStops) {
    const entry = stop.schedule_entries as unknown as StopEntry;
    const stopPlaceId = entry.stop_group_id ?? `${entry.stop_lat.toFixed(6)},${entry.stop_lng.toFixed(6)}`;
    if (stopPlaceId !== placeId) continue;

    const stopTime = stopDateTime(entry.arrival_time);
    if (eventTime < stopTime.minus({ minutes: EARLY_ARRIVAL_WINDOW_MINUTES })) continue;

    const arrivalTime = stopDateTime(entry.arrival_time);
    const diff = Math.abs(arrivalTime.diff(eventTime, "minutes").minutes);
    eligible.push({ scheduleEntryId: stop.schedule_entry_id, entry, diff });
  }

  if (eligible.length === 0) {
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  eligible.sort((a, b) => a.diff - b.diff);
  const matched = eligible[0];

  // 6. Contiguous-prefix guard: only mark head-of-line pending stop
  // Use allPendingStops (including ungeocoded) so an earlier ungeocoded stop
  // correctly blocks advancement of a later geocoded stop.
  const matchedIndex = allPendingStops.findIndex(
    (s) => s.schedule_entry_id === matched.scheduleEntryId,
  );

  if (matchedIndex > 0) {
    const firstPending = allPendingStops[0].schedule_entries as unknown as { stop_sequence: number };
    const matchedEntry = matched.entry;
    console.warn("processDeviceGeofenceEvents: deferred non-adjacent device geofence", {
      vanId,
      runId: run.id,
      eventId,
      placeId,
      matchedScheduleEntryId: matched.scheduleEntryId,
      firstPendingScheduleEntryId: allPendingStops[0].schedule_entry_id,
      matchedSequence: matchedEntry.stop_sequence,
      firstPendingSequence: firstPending.stop_sequence,
    });
    await updateEventStatus(supabase, vanId, eventId, "deferred");
    return;
  }

  // 7. No-GPS-stream immediate fallback (FR-013):
  // If no GPS pings exist at all for this van, the tracker has no GPS stream —
  // trust the device geofence immediately at 0.85 confidence.
  // Note: geofence events are processed BEFORE the current ping is upserted,
  // so this checks for pings from prior requests only.
  const { data: anyPings } = await supabase
    .from("van_location_pings")
    .select("id")
    .eq("van_id", vanId)
    .limit(1);

  const hasGpsStream = anyPings && anyPings.length > 0;

  if (!hasGpsStream) {
    // No GPS stream at all — fall back immediately
    const { error: passError } = await supabase
      .from("route_run_stops")
      .update({
        status: "passed",
        passed_at: eventTs,
        pass_source: "device_geofence",
        pass_confidence: 0.85,
      })
      .eq("run_id", run.id)
      .eq("schedule_entry_id", matched.scheduleEntryId);

    if (passError) {
      console.error("processDeviceGeofenceEvents: mark passed (no-GPS fallback) failed", {
        runId: run.id, scheduleEntryId: matched.scheduleEntryId, error: passError.message,
      });
      await updateEventStatus(supabase, vanId, eventId, "no_match");
      return;
    }

    await persistCanonicalProgress(supabase, run.id);

    await supabase
      .from("tracking_geofence_events")
      .update({
        status: "matched",
        matched_run_id: run.id,
        matched_schedule_entry_id: matched.scheduleEntryId,
      })
      .eq("van_id", vanId)
      .eq("event_id", eventId);

    tentativeMatchIds.push(eventId);
    return;
  }

  // 8. GPS stream exists — enter awaiting_corroboration state.
  // The stop is NOT marked as passed yet; a subsequent GPS ping within
  // geofence_radius_m will confirm it via evaluatePendingCorroborations().
  await supabase
    .from("tracking_geofence_events")
    .update({
      status: "awaiting_corroboration",
      matched_run_id: run.id,
      matched_schedule_entry_id: matched.scheduleEntryId,
    })
    .eq("van_id", vanId)
    .eq("event_id", eventId);
}

async function updateEventStatus(
  supabase: SupabaseClient,
  vanId: string,
  eventId: string,
  status: "no_match" | "deferred" | "awaiting_corroboration",
) {
  const { error } = await supabase
    .from("tracking_geofence_events")
    .update({ status })
    .eq("van_id", vanId)
    .eq("event_id", eventId);

  if (error) {
    console.error("processDeviceGeofenceEvents: status update failed", {
      vanId, eventId, error: error.message,
    });
  }
}
