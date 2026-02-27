import { NextRequest, NextResponse } from "next/server";

import { apiError, validationError } from "@/lib/api/errors";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { nowBahia } from "@/lib/time";
import { extractUrls } from "@/lib/url-extractor";
import { ingestionSchema } from "@/lib/validators/ingestion";

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

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

  if (vanError || !van) {
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

  const parsed = ingestionSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const urls = extractUrls(parsed.data.message);
  if (urls.length !== 1) {
    return apiError(
      "INVALID_MESSAGE",
      "Message must contain exactly one URL",
      400,
    );
  }

  const locationUrl = urls[0];
  const now = nowBahia();
  const updatedAt = now.toISO()!;

  const { error: updateError } = await supabase
    .from("vans")
    .update({
      location_url: locationUrl,
      location_updated_at: updatedAt,
    })
    .eq("id", vanId);

  if (updateError) {
    return apiError("NOT_FOUND", "Failed to update van location", 500);
  }

  return NextResponse.json({ locationUrl, updatedAt });
}
