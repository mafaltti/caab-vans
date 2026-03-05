import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { apiError, validationError } from "@/lib/api/errors";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { inferStopProgress } from "@/lib/tracking/infer-stop-progress";
import { snapToRoad } from "@/lib/tracking/osrm";
import { trackingSchema } from "@/lib/validators/tracking";

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

  const parsed = trackingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { deviceId, lat, lng, accuracy, speed, heading, ts } = parsed.data;

  // Clamp device timestamp: if >5 min in the future, use server time instead.
  // This prevents a single bad client clock from poisoning the out-of-order guard.
  const now = Date.now();
  const clampedTs = ts > now + MAX_FUTURE_MS ? now : ts;
  const deviceTs = DateTime.fromMillis(clampedTs).toISO()!;

  // Staleness guard — reject pings older than 24 hours
  if (clampedTs < now - 24 * 60 * 60 * 1000) {
    return apiError("VALIDATION_ERROR", "Ping too old", 400);
  }

  // Query latest ping BEFORE upsert so isNewest compares against the previous state
  const { data: previousLatest } = await supabase
    .from("van_location_pings")
    .select("device_ts")
    .eq("van_id", vanId)
    .order("device_ts", { ascending: false })
    .limit(1)
    .single();

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
      },
      { onConflict: "van_id,device_ts", ignoreDuplicates: true },
    )
    .select("id")
    .single();

  // PGRST116 = no rows returned → duplicate was silently skipped
  if (upsertError?.code === "PGRST116") {
    return NextResponse.json({ received: true, duplicate: true, ts: Date.now() });
  }

  if (upsertError) {
    return apiError("INTERNAL_ERROR", "Failed to store ping", 500);
  }

  if (!upsertedPing) {
    return NextResponse.json({ received: true, duplicate: true, ts: Date.now() });
  }

  // Update van position only if this ping is strictly newer than the previous
  // latest ping. Combined with the 5-min future clamp above, this prevents
  // both out-of-order regressions and timestamp poisoning.
  const isNewest =
    !previousLatest ||
    DateTime.fromISO(deviceTs) > DateTime.fromISO(previousLatest.device_ts);

  if (isNewest) {
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

    const { error: updateError } = await supabase
      .from("vans")
      .update({
        last_lat: lat,
        last_lng: lng,
        last_accuracy_m: accuracy,
        last_speed_mps: speed,
        last_heading_deg: heading,
        snapped_lat: snappedLat,
        snapped_lng: snappedLng,
        location_updated_at: new Date().toISOString(),
      })
      .eq("id", vanId);

    if (updateError) {
      return apiError("INTERNAL_ERROR", "Failed to update van position", 500);
    }

    try {
      await inferStopProgress(supabase, vanId, lat, lng);
    } catch (error) {
      console.error("Stop inference failed:", error);
    }
  }

  return NextResponse.json({ received: true, ts: Date.now() });
}
