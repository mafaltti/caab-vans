import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { apiError, validationError } from "@/lib/api/errors";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { inferStopProgress } from "@/lib/tracking/infer-stop-progress";
import { trackingSchema } from "@/lib/validators/tracking";

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 25 });

const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

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

  // Convert device timestamp from Unix ms to ISO; cap if >24h in the future
  const now = Date.now();
  const deviceTs =
    ts > now + MAX_FUTURE_MS
      ? DateTime.now().toISO()!
      : DateTime.fromMillis(ts).toISO()!;

  const { error: insertError } = await supabase
    .from("van_location_pings")
    .insert({
      van_id: vanId,
      device_id: deviceId,
      lat,
      lng,
      accuracy_m: accuracy,
      speed_mps: speed,
      heading_deg: heading,
      device_ts: deviceTs,
    });

  if (insertError) {
    return apiError("INTERNAL_ERROR", "Failed to store ping", 500);
  }

  // Update van position — always use the latest ping's data.
  // The previous out-of-order guard compared device_ts values, but a single
  // bad client timestamp could permanently block all future updates.
  // Since pings arrive sequentially per van and the BFF processes them
  // in order, a simple unconditional update is sufficient.
  const { error: updateError } = await supabase
    .from("vans")
    .update({
      last_lat: lat,
      last_lng: lng,
      last_accuracy_m: accuracy,
      last_speed_mps: speed,
      last_heading_deg: heading,
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

  return NextResponse.json({ received: true, ts: Date.now() });
}
