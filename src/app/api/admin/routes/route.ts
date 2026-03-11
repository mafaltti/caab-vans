import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { createRouteSchema } from "@/lib/validators/route";

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("routes")
    .select("id, name, van_id, vans(id, name)")
    .order("name");

  if (error) {
    return apiError("NOT_FOUND", "Failed to fetch routes", 500);
  }

  const routeIds = (data ?? []).map((r) => r.id);
  const driversByRoute = new Map<string, string[]>();

  if (routeIds.length > 0) {
    const { data: assignments } = await supabase
      .from("route_drivers")
      .select("route_id, driver_id")
      .in("route_id", routeIds);

    for (const a of assignments ?? []) {
      const list = driversByRoute.get(a.route_id) ?? [];
      list.push(a.driver_id);
      driversByRoute.set(a.route_id, list);
    }
  }

  const routes = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    vanId: r.van_id,
    van: r.vans as unknown as { id: string; name: string } | null,
    driverIds: driversByRoute.get(r.id) ?? [],
  }));

  return NextResponse.json({ routes });
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = createRouteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  // Check van uniqueness — one van per route
  const { data: existing } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", parsed.data.vanId)
    .limit(1);

  if (existing && existing.length > 0) {
    return apiError("CONFLICT", "Esta van já está atribuída a outra rota", 409);
  }

  // Validate driver IDs before creating route
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
    .insert({
      name: parsed.data.name,
      van_id: parsed.data.vanId,
    })
    .select()
    .single();

  if (error) {
    return apiError("VALIDATION_ERROR", "Failed to create route", 400);
  }

  if (driverIds.length > 0) {
    const { error: driverError } = await supabase
      .from("route_drivers")
      .insert(driverIds.map((dId) => ({ route_id: data.id, driver_id: dId })));

    if (driverError) {
      // Rollback route creation on driver assignment failure
      await supabase.from("routes").delete().eq("id", data.id);
      return apiError("INTERNAL_ERROR", "Failed to assign drivers", 500);
    }
  }

  return NextResponse.json(
    {
      route: {
        id: data.id,
        name: data.name,
        vanId: data.van_id,
        driverIds,
      },
    },
    { status: 201 },
  );
}
