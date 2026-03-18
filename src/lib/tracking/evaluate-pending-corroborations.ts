import { SupabaseClient } from "@supabase/supabase-js";

import { haversineDistanceMeters } from "./haversine";
import { persistCanonicalProgress } from "./persist-canonical-progress";

const STALENESS_THRESHOLD_MS = 30_000;

export async function evaluatePendingCorroborations(args: {
  supabase: SupabaseClient;
  vanId: string;
  pingLat: number;
  pingLng: number;
  pingReceivedAt: string;
}): Promise<string[]> {
  const { supabase, vanId, pingLat, pingLng, pingReceivedAt } = args;
  const confirmedEventIds: string[] = [];

  // 1. Fetch all awaiting_corroboration events for this van, ordered by entered_at
  const { data: awaitingEvents, error: fetchError } = await supabase
    .from("tracking_geofence_events")
    .select("event_id, matched_run_id, matched_schedule_entry_id, received_at")
    .eq("van_id", vanId)
    .eq("status", "awaiting_corroboration")
    .order("entered_at", { ascending: true });

  if (fetchError || !awaitingEvents || awaitingEvents.length === 0) return [];

  // 2. Look up shift start times for GPS stream scoping (P1 fix)
  const uniqueRunIds = [...new Set(
    awaitingEvents.map((e) => e.matched_run_id).filter(Boolean) as string[],
  )];

  const shiftStartMap = new Map<string, string>();
  if (uniqueRunIds.length > 0) {
    const { data: shifts } = await supabase
      .from("route_shifts")
      .select("run_id, started_at")
      .in("run_id", uniqueRunIds)
      .order("started_at", { ascending: false });

    for (const s of shifts ?? []) {
      // Keep only the most recent shift per run (first seen due to desc order)
      if (!shiftStartMap.has(s.run_id)) {
        shiftStartMap.set(s.run_id, s.started_at);
      }
    }
  }

  // 3. Evaluate each event — only confirm head-of-line pending stop per run
  for (const event of awaitingEvents) {
    const { event_id, matched_run_id, matched_schedule_entry_id, received_at } = event;
    if (!matched_run_id || !matched_schedule_entry_id) continue;

    // Get the matched stop's coordinates and geofence radius
    const { data: stopEntry } = await supabase
      .from("schedule_entries")
      .select("stop_lat, stop_lng, geofence_radius_m")
      .eq("id", matched_schedule_entry_id)
      .single();

    if (!stopEntry || stopEntry.stop_lat == null || stopEntry.stop_lng == null) continue;

    // Contiguous-prefix guard: only confirm if this is the first pending stop
    const { data: pendingStops } = await supabase
      .from("route_run_stops")
      .select("schedule_entry_id, schedule_entries!inner(stop_sequence)")
      .eq("run_id", matched_run_id)
      .eq("status", "pending")
      .order("schedule_entries(stop_sequence)", { ascending: true })
      .limit(1);

    if (!pendingStops || pendingStops.length === 0) continue;
    if (pendingStops[0].schedule_entry_id !== matched_schedule_entry_id) continue;

    // Check GPS distance from current ping to matched stop
    const distance = haversineDistanceMeters(
      pingLat, pingLng,
      stopEntry.stop_lat, stopEntry.stop_lng,
    );

    if (distance <= stopEntry.geofence_radius_m) {
      // GPS corroborated — confirm at 0.95
      await confirmStop({
        supabase, matched_run_id, matched_schedule_entry_id,
        vanId, event_id, confidence: 0.95, passed_at: pingReceivedAt,
      });
      confirmedEventIds.push(event_id);
      console.warn(JSON.stringify({
        event: "corroboration:gps_confirmed",
        vanId, eventId: event_id, distance,
        radius: stopEntry.geofence_radius_m, confidence: 0.95,
      }));
      continue;
    }

    // Check staleness: has any GPS ping arrived after this event was received?
    const { data: pingsAfterEvent } = await supabase
      .from("van_location_pings")
      .select("id")
      .eq("van_id", vanId)
      .gt("received_at", received_at)
      .limit(1);

    const hasPingsAfterEvent = pingsAfterEvent && pingsAfterEvent.length > 0;

    if (hasPingsAfterEvent) {
      // GPS is alive but van is not close enough — keep waiting
      continue;
    }

    // No pings after event receipt — check if enough time has elapsed for staleness
    const elapsedMs = new Date(pingReceivedAt).getTime() - new Date(received_at).getTime();

    // Check if there are any pings during the current shift (not full history)
    const shiftStartedAt = shiftStartMap.get(matched_run_id);
    let pingsQuery = supabase
      .from("van_location_pings")
      .select("id")
      .eq("van_id", vanId);
    if (shiftStartedAt) {
      pingsQuery = pingsQuery.gte("received_at", shiftStartedAt);
    }
    const { data: anyPings } = await pingsQuery.limit(1);

    const hasAnyPings = anyPings && anyPings.length > 0;

    if (!hasAnyPings) {
      // No GPS stream in current shift — immediate fallback at 0.85
      await confirmStop({
        supabase, matched_run_id, matched_schedule_entry_id,
        vanId, event_id, confidence: 0.85, passed_at: pingReceivedAt,
      });
      confirmedEventIds.push(event_id);
      console.warn(JSON.stringify({
        event: "corroboration:no_gps_stream_fallback",
        vanId, eventId: event_id, confidence: 0.85,
      }));
      continue;
    }

    if (elapsedMs >= STALENESS_THRESHOLD_MS) {
      // GPS stale — fallback at 0.90
      await confirmStop({
        supabase, matched_run_id, matched_schedule_entry_id,
        vanId, event_id, confidence: 0.90, passed_at: pingReceivedAt,
      });
      confirmedEventIds.push(event_id);
      console.warn(JSON.stringify({
        event: "corroboration:staleness_fallback",
        vanId, eventId: event_id, elapsedMs, confidence: 0.90,
      }));
      continue;
    }

    // Not yet stale — keep waiting
  }

  return confirmedEventIds;
}

async function confirmStop(args: {
  supabase: SupabaseClient;
  matched_run_id: string;
  matched_schedule_entry_id: string;
  vanId: string;
  event_id: string;
  confidence: number;
  passed_at: string;
}) {
  const { supabase, matched_run_id, matched_schedule_entry_id, vanId, event_id, confidence, passed_at } = args;

  const { error: passError } = await supabase
    .from("route_run_stops")
    .update({
      status: "passed",
      passed_at,
      pass_source: "device_geofence",
      pass_confidence: confidence,
    })
    .eq("run_id", matched_run_id)
    .eq("schedule_entry_id", matched_schedule_entry_id);

  if (passError) {
    console.error("evaluatePendingCorroborations: mark passed failed", {
      runId: matched_run_id,
      scheduleEntryId: matched_schedule_entry_id,
      error: passError.message,
    });
    return;
  }

  await persistCanonicalProgress(supabase, matched_run_id);

  await supabase
    .from("tracking_geofence_events")
    .update({ status: "matched" })
    .eq("van_id", vanId)
    .eq("event_id", event_id);
}
