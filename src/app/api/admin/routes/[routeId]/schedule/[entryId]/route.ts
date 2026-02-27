import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { updateScheduleEntrySchema } from "@/lib/validators/schedule-entry";

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

  // Check duplicate time (excluding current entry)
  const { data: existing } = await supabase
    .from("schedule_entries")
    .select("id")
    .eq("route_id", routeId)
    .eq("time", parsed.data.time)
    .neq("id", entryId)
    .limit(1);

  if (existing && existing.length > 0) {
    return apiError("CONFLICT", "Já existe um horário com este mesmo tempo nesta rota", 409);
  }

  const { data, error } = await supabase
    .from("schedule_entries")
    .update({
      stop_name: parsed.data.stopName,
      time: parsed.data.time,
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
      time: data.time?.slice(0, 5),
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
