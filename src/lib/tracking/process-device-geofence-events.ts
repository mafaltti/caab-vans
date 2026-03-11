import { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { EARLY_ARRIVAL_WINDOW_MINUTES } from "@/lib/time";

import { haversineDistanceMeters } from "./haversine";
import { seedRouteRunStops } from "./seed-route-run-stops";

const TZ = "America/Bahia";
const PING_WINDOW_MINUTES = 5;

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

  return tentativeMatchIds;
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

    if (existing.status === "no_match") return; // Conditions unchanged, skip

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

  // 5. Resolve placeId to pending stops
  const { data: pendingStops, error: pendingError } = await supabase
    .from("route_run_stops")
    .select(
      "schedule_entry_id, schedule_entries!inner(time, stop_lat, stop_lng, stop_group_id, geofence_radius_m)",
    )
    .eq("run_id", run.id)
    .eq("status", "pending")
    .not("schedule_entries.stop_lat", "is", null)
    .not("schedule_entries.stop_lng", "is", null);

  if (pendingError) {
    console.error("processDeviceGeofenceEvents: pending stops query failed", {
      runId: run.id, error: pendingError.message,
    });
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  if (!pendingStops || pendingStops.length === 0) {
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  // Sort by scheduled time
  pendingStops.sort((a, b) => {
    const ta = (a.schedule_entries as unknown as { time: string }).time;
    const tb = (b.schedule_entries as unknown as { time: string }).time;
    return ta.localeCompare(tb);
  });

  function stopDateTime(hhMm: string): DateTime {
    const [hour, minute] = hhMm.split(":").map(Number);
    return eventTime.set({ hour, minute, second: 0, millisecond: 0 });
  }

  // Match by placeId + early arrival window, then pick closest-in-time
  type StopEntry = {
    time: string;
    stop_lat: number;
    stop_lng: number;
    stop_group_id: string | null;
    geofence_radius_m: number;
  };

  const eligible: { scheduleEntryId: string; entry: StopEntry; diff: number }[] = [];

  for (const stop of pendingStops) {
    const entry = stop.schedule_entries as unknown as StopEntry;
    const stopPlaceId = entry.stop_group_id ?? `${entry.stop_lat.toFixed(6)},${entry.stop_lng.toFixed(6)}`;
    if (stopPlaceId !== placeId) continue;

    const stopTime = stopDateTime(entry.time);
    if (eventTime < stopTime.minus({ minutes: EARLY_ARRIVAL_WINDOW_MINUTES })) continue;

    const diff = Math.abs(stopTime.diff(eventTime, "minutes").minutes);
    eligible.push({ scheduleEntryId: stop.schedule_entry_id, entry, diff });
  }

  if (eligible.length === 0) {
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  eligible.sort((a, b) => a.diff - b.diff);
  const matched = eligible[0];

  // 6. Tiered confidence with GPS corroboration
  let confidence = 0.90;

  const windowStart = new Date(enteredAt - PING_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data: recentPings } = await supabase
    .from("van_location_pings")
    .select("lat, lng")
    .eq("van_id", vanId)
    .gte("device_ts", windowStart)
    .lte("device_ts", eventTs);

  if (recentPings) {
    for (const ping of recentPings) {
      const dist = haversineDistanceMeters(
        ping.lat, ping.lng,
        matched.entry.stop_lat, matched.entry.stop_lng,
      );
      if (dist <= matched.entry.geofence_radius_m) {
        confidence = 0.95;
        break;
      }
    }
  }

  // 7. Mark stop as passed
  const { error: passError } = await supabase
    .from("route_run_stops")
    .update({
      status: "passed",
      passed_at: eventTs,
      pass_source: "device_geofence",
      pass_confidence: confidence,
    })
    .eq("run_id", run.id)
    .eq("schedule_entry_id", matched.scheduleEntryId);

  if (passError) {
    console.error("processDeviceGeofenceEvents: mark passed failed", {
      runId: run.id, scheduleEntryId: matched.scheduleEntryId, error: passError.message,
    });
    await updateEventStatus(supabase, vanId, eventId, "no_match");
    return;
  }

  // 8. Conservative gap-1 backfill
  const matchedIndex = pendingStops.findIndex(
    (s) => s.schedule_entry_id === matched.scheduleEntryId,
  );
  if (matchedIndex > 0) {
    const prev = pendingStops[matchedIndex - 1];
    // Only backfill if it's the immediately preceding pending stop
    const { error: backfillError } = await supabase
      .from("route_run_stops")
      .update({
        status: "passed",
        passed_at: eventTs,
        pass_source: "backfill",
        pass_confidence: 0.80,
      })
      .eq("run_id", run.id)
      .eq("schedule_entry_id", prev.schedule_entry_id)
      .eq("status", "pending");

    if (backfillError) {
      console.error("processDeviceGeofenceEvents: backfill failed", {
        runId: run.id, scheduleEntryId: prev.schedule_entry_id, error: backfillError.message,
      });
    }
  }

  // 9. Update ledger
  await supabase
    .from("tracking_geofence_events")
    .update({
      status: "matched",
      matched_run_id: run.id,
      matched_schedule_entry_id: matched.scheduleEntryId,
    })
    .eq("van_id", vanId)
    .eq("event_id", eventId);

  // 10. Record tentative match
  tentativeMatchIds.push(eventId);
}

async function updateEventStatus(
  supabase: SupabaseClient,
  vanId: string,
  eventId: string,
  status: "no_match",
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
