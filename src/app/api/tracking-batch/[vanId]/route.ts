import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { apiError, validationError } from "@/lib/api/errors";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { inferStopProgress } from "@/lib/tracking/infer-stop-progress";
import { matchTrajectory } from "@/lib/tracking/osrm";
import { batchTrackingSchema } from "@/lib/validators/tracking";

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 25 });

const MAX_FUTURE_MS = 5 * 60 * 1000; // 5 minutes — clamp anything beyond this

type RouteParams = { params: Promise<{ vanId: string }> };

interface AcceptedPing {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  deviceTs: string;
}

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
  const accepted: AcceptedPing[] = [];

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

    accepted.push({
      id: upsertedPing.id,
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      speed: point.speed,
      heading: point.heading,
      deviceTs,
    });
  }

  if (accepted.length > 0) {
    // OSRM match trajectory for per-ping snapped coords
    let perPointSnapped: Array<{ lat: number; lng: number } | null> | null = null;
    const osrmBaseUrl = process.env.OSRM_BASE_URL;

    if (osrmBaseUrl && accepted.length >= 2) {
      const trajectory = accepted.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        ts: new Date(p.deviceTs).getTime(),
        accuracy: p.accuracy ?? undefined,
      }));

      perPointSnapped = await matchTrajectory(trajectory, osrmBaseUrl);

      // Write snapped coords back to accepted pings
      if (perPointSnapped) {
        for (let i = 0; i < accepted.length; i++) {
          const snapped = perPointSnapped[i];
          if (snapped) {
            await supabase
              .from("van_location_pings")
              .update({ snapped_lat: snapped.lat, snapped_lng: snapped.lng })
              .eq("id", accepted[i].id);
          }
        }
      }
    }

    // Find newest accepted point for van position update
    const newest = accepted[accepted.length - 1]; // already sorted chronologically
    const newestSnapped = perPointSnapped?.[accepted.length - 1] ?? null;

    const { error: updateError } = await supabase.rpc("update_van_position", {
      p_van_id: vanId,
      p_lat: newest.lat,
      p_lng: newest.lng,
      p_accuracy_m: newest.accuracy,
      p_speed_mps: newest.speed,
      p_heading_deg: newest.heading,
      p_snapped_lat: newestSnapped?.lat ?? null,
      p_snapped_lng: newestSnapped?.lng ?? null,
      p_device_ts: newest.deviceTs,
    });

    if (updateError) {
      return apiError("INTERNAL_ERROR", "Failed to update van position", 500);
    }

    // Replay inference sequentially for each accepted ping with its own eventTs
    for (let i = 0; i < accepted.length; i++) {
      const ping = accepted[i];
      const snapped = perPointSnapped?.[i] ?? null;
      try {
        await inferStopProgress({
          supabase,
          vanId,
          rawLat: ping.lat,
          rawLng: ping.lng,
          snappedLat: snapped?.lat ?? null,
          snappedLng: snapped?.lng ?? null,
          eventTs: ping.deviceTs,
        });
      } catch (error) {
        console.error("Stop inference failed for batch ping:", error);
      }
    }
  }

  return NextResponse.json({
    received: sorted.length - skipped,
    duplicates,
    ts: Date.now(),
  });
}
