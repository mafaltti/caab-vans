import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { updateScheduleEntrySchema } from "@/lib/validators/schedule-entry";
import { formatTimeString } from "@/lib/time";

type RouteParams = { params: Promise<{ routeId: string; entryId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId, entryId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = updateScheduleEntrySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("schedule_entries")
    .update({
      stop_name: parsed.data.stopName,
      arrival_time: parsed.data.arrivalTime,
      departure_time: parsed.data.departureTime,
      stop_lat: parsed.data.stopLat ?? null,
      stop_lng: parsed.data.stopLng ?? null,
      stop_group_id: parsed.data.stopGroupId ?? null,
    })
    .eq("id", entryId)
    .eq("route_id", routeId)
    .select()
    .single();

  if (error || !data) {
    return apiError("NOT_FOUND", "Schedule entry not found", 404);
  }

  return NextResponse.json({
    entry: {
      id: data.id,
      stopName: data.stop_name,
      arrivalTime: data.arrival_time ? formatTimeString(data.arrival_time) : undefined,
      departureTime: data.departure_time ? formatTimeString(data.departure_time) : undefined,
      stopSequence: data.stop_sequence,
      stopLat: data.stop_lat ?? null,
      stopLng: data.stop_lng ?? null,
      stopGroupId: data.stop_group_id ?? null,
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId, entryId } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("schedule_entries")
    .delete()
    .eq("id", entryId)
    .eq("route_id", routeId)
    .select("id");

  if (error || !data || data.length === 0) {
    return apiError("NOT_FOUND", "Schedule entry not found", 404);
  }

  return new NextResponse(null, { status: 204 });
}
