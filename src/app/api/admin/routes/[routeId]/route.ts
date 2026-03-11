import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { updateRouteSchema } from "@/lib/validators/route";

type RouteParams = { params: Promise<{ routeId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireRole("admin");
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

  const parsed = updateRouteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  // Check van uniqueness — skip if same route already uses this van
  const { data: existing } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", parsed.data.vanId)
    .neq("id", routeId)
    .limit(1);

  if (existing && existing.length > 0) {
    return apiError("CONFLICT", "Esta van já está atribuída a outra rota", 409);
  }

  // Validate driver IDs
  const driverIds = [...new Set(parsed.data.driverIds ?? [])];
  for (const dId of driverIds) {
    const { data: driver } = await supabase.auth.admin.getUserById(dId);
    if (
      !driver?.user ||
      driver.user.app_metadata?.role !== "driver" ||
      driver.user.app_metadata?.is_active === false
    ) {
      return apiError("VALIDATION_ERROR", `Driver ${dId} not found or not a driver`, 400);
    }
  }

  const { data, error } = await supabase
    .from("routes")
    .update({
      name: parsed.data.name,
      van_id: parsed.data.vanId,
    })
    .eq("id", routeId)
    .select()
    .single();

  if (error || !data) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  // Atomic full-replacement via RPC (single transaction)
  const { error: rpcError } = await supabase.rpc("replace_route_drivers", {
    p_route_id: routeId,
    p_driver_ids: driverIds,
  });

  if (rpcError) {
    return apiError("INTERNAL_ERROR", "Failed to update driver assignments", 500);
  }

  return NextResponse.json({
    route: {
      id: data.id,
      name: data.name,
      vanId: data.van_id,
      driverIds,
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId } = await params;
  const supabase = createServiceClient();

  // Delete schedule entries first (cascade)
  await supabase.from("schedule_entries").delete().eq("route_id", routeId);

  const { data, error } = await supabase
    .from("routes")
    .delete()
    .eq("id", routeId)
    .select("id");

  if (error || !data || data.length === 0) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  return new NextResponse(null, { status: 204 });
}
