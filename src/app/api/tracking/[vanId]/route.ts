import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { apiError, validationError } from "@/lib/api/errors";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceCanonicalPrefix } from "@/lib/tracking/enforce-canonical-prefix";
import { processDeviceGeofenceEvents } from "@/lib/tracking/process-device-geofence-events";
import { snapToRoad } from "@/lib/tracking/osrm";
import { trackingSchema } from "@/lib/validators/tracking";

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 40 });

const MAX_FUTURE_MS = 5 * 60 * 1000; // 5 minutes — clamp anything beyond this

type RouteParams = { params: Promise<{ vanId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { vanId } = await params;

  const rateCheck = rateLimiter(vanId);
  if (!rateCheck.allowed) {
    return apiError("RATE_LIMITED", "Too many requests", 429);
  }

  const token = request.headers.get("x-ingestion-token");
  if (!token) {
    return apiError("UNAUTHORIZED", "Invalid ingestion token", 401);
  }

  const supabase = createServiceClient();

  const { data: van, error: vanError } = await supabase
    .from("vans")
    .select("id, ingestion_token")
    .eq("id", vanId)
    .single();

  if (vanError) {
    return vanError.code === "PGRST116"
      ? apiError("NOT_FOUND", "Van not found", 404)
      : apiError("INTERNAL_ERROR", "Failed to look up van", 500);
  }

  if (!van) {
    return apiError("NOT_FOUND", "Van not found", 404);
  }

  if (van.ingestion_token !== token) {
    return apiError("UNAUTHORIZED", "Invalid ingestion token", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = trackingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const {
    deviceId,
    lat,
    lng,
    accuracy,
    speed,
    heading,
    ts,
    bufferSize,
    failureCount,
    batteryLevel,
    networkType,
    geofenceEvents,
  } = parsed.data;

  // Clamp device timestamp: if >5 min in the future, use server time instead.
  // This prevents a single bad client clock from poisoning the out-of-order guard.
  const now = Date.now();
  const clampedTs = ts > now + MAX_FUTURE_MS ? now : ts;
  const deviceTs = DateTime.fromMillis(clampedTs).toISO()!;

  // Staleness guard — reject pings older than 24 hours
  if (clampedTs < now - 24 * 60 * 60 * 1000) {
    return apiError("VALIDATION_ERROR", "Ping too old", 400);
  }

  // Process device geofence events BEFORE ping upsert
  const hasGeofenceEvents = geofenceEvents && geofenceEvents.length > 0;
  let submittedEventIds: string[] = [];
  if (hasGeofenceEvents) {
    submittedEventIds = geofenceEvents.map((e) => e.eventId);
    try {
      await processDeviceGeofenceEvents({ supabase, vanId, geofenceEvents });
    } catch (error) {
      console.error("Device geofence event processing failed:", error);
    }
  }

  // Upsert with unique constraint on (van_id, device_ts) — silently skip duplicates
  const { data: upsertedPing, error: upsertError } = await supabase
    .from("van_location_pings")
    .upsert(
      {
        van_id: vanId,
        device_id: deviceId,
        lat,
        lng,
        accuracy_m: accuracy,
        speed_mps: speed,
        heading_deg: heading,
        device_ts: deviceTs,
        buffer_size: bufferSize ?? null,
        failure_count: failureCount ?? null,
        battery_level: batteryLevel ?? null,
        network_type: networkType ?? null,
      },
      { onConflict: "van_id,device_ts", ignoreDuplicates: true },
    )
    .select("id")
    .single();

  // PGRST116 = no rows returned → duplicate was silently skipped
  const isDuplicate = upsertError?.code === "PGRST116" || !upsertedPing;

  if (upsertError && upsertError.code !== "PGRST116") {
    return apiError("INTERNAL_ERROR", "Failed to store ping", 500);
  }

  // Duplicate pings with geofence events still need processedEventIds computation.
  // Skip OSRM, position update, and inference — jump to response building.
  if (isDuplicate && !hasGeofenceEvents) {
    return NextResponse.json({ received: true, duplicate: true, ts: Date.now() });
  }

  if (isDuplicate) {
    // Duplicate ping WITH geofence events — compute processedEventIds and configVersion
    const response: Record<string, unknown> = { received: true, duplicate: true, ts: Date.now() };
    await appendGeofenceResponse(supabase, vanId, submittedEventIds, response);
    return NextResponse.json(response);
  }

  // OSRM road-snapping (best-effort, before atomic position update)
  let snappedLat: number | null = null;
  let snappedLng: number | null = null;

  const osrmBaseUrl = process.env.OSRM_BASE_URL;
  if (osrmBaseUrl) {
    const { data: recentPings } = await supabase
      .from("van_location_pings")
      .select("lat, lng, device_ts, accuracy_m")
      .eq("van_id", vanId)
      .lte("device_ts", deviceTs)
      .order("device_ts", { ascending: false })
      .limit(5);

    const trajectory = (recentPings ?? [])
      .map((p) => ({
        lat: p.lat,
        lng: p.lng,
        ts: new Date(p.device_ts).getTime(),
        accuracy: p.accuracy_m ?? undefined,
      }))
      .reverse();

    const snapped = await snapToRoad(trajectory, osrmBaseUrl);
    if (snapped) {
      snappedLat = snapped.lat;
      snappedLng = snapped.lng;
    }
  }

  // Atomically update van position only if this ping is newer than what's stored.
  // The RPC's WHERE guard (p_device_ts > last_gps_fix_at) prevents out-of-order
  // regressions without a separate SELECT query.
  const { error: updateError } = await supabase.rpc("update_van_position", {
    p_van_id: vanId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy_m: accuracy,
    p_speed_mps: speed,
    p_heading_deg: heading,
    p_snapped_lat: snappedLat,
    p_snapped_lng: snappedLng,
    p_device_ts: deviceTs,
  });

  if (updateError) {
    console.error("update_van_position failed (ping already stored):", {
      vanId, deviceTs, error: updateError.message,
    });
  }

  // Write snapped coords back to the accepted ping
  if (snappedLat != null && snappedLng != null) {
    const { error: snapWriteError } = await supabase
      .from("van_location_pings")
      .update({ snapped_lat: snappedLat, snapped_lng: snappedLng })
      .eq("id", upsertedPing.id);

    if (snapWriteError) {
      console.error("Failed to persist snapped coords:", {
        pingId: upsertedPing.id, error: snapWriteError.message,
      });
    }
  }

  const response: Record<string, unknown> = { received: true, ts: Date.now() };

  if (hasGeofenceEvents) {
    await appendGeofenceResponse(supabase, vanId, submittedEventIds, response);
  } else {
    // Always include configVersion when van has a route (lightweight query)
    await appendConfigVersion(supabase, vanId, response);
  }

  return NextResponse.json(response);
}

export async function appendGeofenceResponse(
  supabase: ReturnType<typeof createServiceClient>,
  vanId: string,
  submittedEventIds: string[],
  response: Record<string, unknown>,
): Promise<void> {
  // Compute processedEventIds: only events whose matched stops survived canonical healing
  if (submittedEventIds.length > 0) {
    // Batch .in() queries to stay under Kong's 4KB header limit (~50 UUIDs per batch)
    const BATCH_SIZE = 50;
    const confirmedEvents: { event_id: string; matched_schedule_entry_id: string | null; matched_run_id: string | null }[] = [];
    for (let i = 0; i < submittedEventIds.length; i += BATCH_SIZE) {
      const batch = submittedEventIds.slice(i, i + BATCH_SIZE);
      const { data } = await supabase
        .from("tracking_geofence_events")
        .select("event_id, matched_schedule_entry_id, matched_run_id")
        .eq("van_id", vanId)
        .in("event_id", batch)
        .eq("status", "matched");
      if (data) confirmedEvents.push(...data);
    }

    if (confirmedEvents && confirmedEvents.length > 0) {
      const runIds = [...new Set(confirmedEvents.map((e) => e.matched_run_id).filter(Boolean))] as string[];

      if (runIds.length > 0) {
        // Build contiguous prefix per run using enforceCanonicalPrefix
        const allContiguousIds = new Set<string>();

        for (const runId of runIds) {
          const { data: allStops } = await supabase
            .from("route_run_stops")
            .select("schedule_entry_id, status, schedule_entries!inner(stop_sequence)")
            .eq("run_id", runId)
            .order("schedule_entries(stop_sequence)", { ascending: true });

          if (allStops && allStops.length > 0) {
            const sortedStops = allStops.map((s) => ({
              schedule_entry_id: s.schedule_entry_id,
              status: s.status as "pending" | "passed",
            }));
            const { contiguousPassedIds } = enforceCanonicalPrefix(sortedStops);
            for (const id of contiguousPassedIds) {
              allContiguousIds.add(id);
            }
          }
        }

        response.processedEventIds = confirmedEvents
          .filter((e) => e.matched_schedule_entry_id && allContiguousIds.has(e.matched_schedule_entry_id))
          .map((e) => e.event_id);
      }
    }

    if (!response.processedEventIds) {
      response.processedEventIds = [];
    }
  }

  await appendConfigVersion(supabase, vanId, response);
}

export async function appendConfigVersion(
  supabase: ReturnType<typeof createServiceClient>,
  vanId: string,
  response: Record<string, unknown>,
): Promise<void> {
  const { data: route } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", vanId)
    .maybeSingle();

  if (route) {
    const { data: entries } = await supabase
      .from("schedule_entries")
      .select("updated_at")
      .eq("route_id", route.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (entries && entries.length > 0) {
      response.configVersion = entries[0].updated_at;
    }
  }
}
