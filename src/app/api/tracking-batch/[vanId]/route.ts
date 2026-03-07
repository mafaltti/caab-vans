import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { apiError, validationError } from "@/lib/api/errors";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { inferStopProgress } from "@/lib/tracking/infer-stop-progress";
import { snapToRoad } from "@/lib/tracking/osrm";
import { batchTrackingSchema } from "@/lib/validators/tracking";

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 25 });

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

  const parsed = batchTrackingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { points } = parsed.data;
  const now = Date.now();

  // Sort points chronologically by device timestamp
  const sorted = [...points].sort((a, b) => a.ts - b.ts);

  let duplicates = 0;
  let skipped = 0;
  let newestUpserted: { lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null; deviceTs: string } | null = null;

  for (const point of sorted) {
    // Clamp device timestamp: if >5 min in the future, use server time
    const clampedTs = point.ts > now + MAX_FUTURE_MS ? now : point.ts;

    // Staleness guard — skip pings older than 24 hours silently
    if (clampedTs < now - 24 * 60 * 60 * 1000) {
      skipped++;
      continue;
    }

    const deviceTs = DateTime.fromMillis(clampedTs).toISO()!;

    const { data: upsertedPing, error: upsertError } = await supabase
      .from("van_location_pings")
      .upsert(
        {
          van_id: vanId,
          device_id: point.deviceId,
          lat: point.lat,
          lng: point.lng,
          accuracy_m: point.accuracy,
          speed_mps: point.speed,
          heading_deg: point.heading,
          device_ts: deviceTs,
          buffer_size: point.bufferSize ?? null,
          failure_count: point.failureCount ?? null,
          battery_level: point.batteryLevel ?? null,
          network_type: point.networkType ?? null,
        },
        { onConflict: "van_id,device_ts", ignoreDuplicates: true },
      )
      .select("id")
      .single();

    // PGRST116 = no rows returned — duplicate was silently skipped
    if (upsertError?.code === "PGRST116" || !upsertedPing) {
      duplicates++;
      continue;
    }

    if (upsertError) {
      return apiError("INTERNAL_ERROR", "Failed to store ping", 500);
    }

    // Track newest successfully upserted point
    if (
      !newestUpserted ||
      DateTime.fromISO(deviceTs) > DateTime.fromISO(newestUpserted.deviceTs)
    ) {
      newestUpserted = {
        lat: point.lat,
        lng: point.lng,
        accuracy: point.accuracy,
        speed: point.speed,
        heading: point.heading,
        deviceTs,
      };
    }
  }

  // Update van position + OSRM snap + stop inference for the newest upserted point only
  if (newestUpserted) {
    let snappedLat: number | null = null;
    let snappedLng: number | null = null;

    const osrmBaseUrl = process.env.OSRM_BASE_URL;
    if (osrmBaseUrl) {
      const { data: recentPings } = await supabase
        .from("van_location_pings")
        .select("lat, lng, device_ts, accuracy_m")
        .eq("van_id", vanId)
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

    const { data: updated, error: updateError } = await supabase.rpc("update_van_position", {
      p_van_id: vanId,
      p_lat: newestUpserted.lat,
      p_lng: newestUpserted.lng,
      p_accuracy_m: newestUpserted.accuracy,
      p_speed_mps: newestUpserted.speed,
      p_heading_deg: newestUpserted.heading,
      p_snapped_lat: snappedLat,
      p_snapped_lng: snappedLng,
      p_device_ts: newestUpserted.deviceTs,
    });

    if (updateError) {
      return apiError("INTERNAL_ERROR", "Failed to update van position", 500);
    }

    if (updated) {
      try {
        await inferStopProgress(
          supabase,
          vanId,
          newestUpserted.lat,
          newestUpserted.lng,
        );
      } catch (error) {
        console.error("Stop inference failed:", error);
      }
    }
  }

  return NextResponse.json({
    received: sorted.length - skipped,
    duplicates,
    ts: Date.now(),
  });
}
