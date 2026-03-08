import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { createScheduleEntrySchema } from "@/lib/validators/schedule-entry";
import { formatTimeString } from "@/lib/time";

type RouteParams = { params: Promise<{ routeId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("schedule_entries")
    .select("id, stop_name, time, stop_lat, stop_lng, stop_group_id")
    .eq("route_id", routeId)
    .order("time");

  if (error) {
    return apiError("NOT_FOUND", "Failed to fetch schedule entries", 500);
  }

  const entries = (data ?? []).map((e) => ({
    id: e.id,
    stopName: e.stop_name,
    time: e.time ? formatTimeString(e.time) : undefined,
    stopLat: e.stop_lat ?? null,
    stopLng: e.stop_lng ?? null,
    stopGroupId: e.stop_group_id ?? null,
  }));

  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = createScheduleEntrySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  // Check duplicate time for this route
  const { data: existing } = await supabase
    .from("schedule_entries")
    .select("id")
    .eq("route_id", routeId)
    .eq("time", parsed.data.time)
    .limit(1);

  if (existing && existing.length > 0) {
    return apiError("CONFLICT", "Já existe um horário com este mesmo tempo nesta rota", 409);
  }

  const { data, error } = await supabase
    .from("schedule_entries")
    .insert({
      route_id: routeId,
      stop_name: parsed.data.stopName,
      time: parsed.data.time,
      stop_lat: parsed.data.stopLat ?? null,
      stop_lng: parsed.data.stopLng ?? null,
      stop_group_id: parsed.data.stopGroupId ?? null,
    })
    .select()
    .single();

  if (error) {
    return apiError("VALIDATION_ERROR", "Failed to create schedule entry", 400);
  }

  return NextResponse.json(
    {
      entry: {
        id: data.id,
        stopName: data.stop_name,
        time: data.time ? formatTimeString(data.time) : undefined,
        stopLat: data.stop_lat ?? null,
        stopLng: data.stop_lng ?? null,
        stopGroupId: data.stop_group_id ?? null,
      },
    },
    { status: 201 },
  );
}
