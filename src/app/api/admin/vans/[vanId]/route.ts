import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { getTrackerHealthStatuses } from "@/lib/tracking/tracker-health";

const updateVanSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long").optional(),
  regenerateToken: z.boolean().optional(),
  driverIds: z.array(z.string().uuid("Invalid driver ID")).optional(),
});

type RouteParams = { params: Promise<{ vanId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { vanId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = updateVanSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  // Validate each driverId references an active driver
  if (parsed.data.driverIds && parsed.data.driverIds.length > 0) {
    for (const dId of parsed.data.driverIds) {
      const { data: driver } = await supabase.auth.admin.getUserById(dId);
      if (
        !driver?.user ||
        driver.user.app_metadata?.role !== "driver" ||
        driver.user.app_metadata?.is_active === false
      ) {
        return apiError("VALIDATION_ERROR", `Driver ${dId} not found or not a driver`, 400);
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.regenerateToken) updates.ingestion_token = crypto.randomUUID();

  const hasVanUpdates = Object.keys(updates).length > 0;
  const hasDriverUpdates = parsed.data.driverIds !== undefined;

  if (!hasVanUpdates && !hasDriverUpdates) {
    return apiError("VALIDATION_ERROR", "No fields to update", 400);
  }

  let van;
  if (hasVanUpdates) {
    const { data, error } = await supabase
      .from("vans")
      .update(updates)
      .eq("id", vanId)
      .select()
      .single();

    if (error || !data) {
      return apiError("NOT_FOUND", "Van not found", 404);
    }
    van = data;
  } else {
    const { data, error } = await supabase
      .from("vans")
      .select()
      .eq("id", vanId)
      .single();

    if (error || !data) {
      return apiError("NOT_FOUND", "Van not found", 404);
    }
    van = data;
  }

  if (hasDriverUpdates) {
    const { error: delError } = await supabase
      .from("van_drivers")
      .delete()
      .eq("van_id", vanId);

    if (delError) {
      return apiError("INTERNAL_ERROR", "Failed to update driver assignments", 500);
    }

    if (parsed.data.driverIds!.length > 0) {
      const { error: insError } = await supabase
        .from("van_drivers")
        .insert(parsed.data.driverIds!.map((dId) => ({ van_id: vanId, driver_id: dId })));

      if (insError) {
        return apiError("INTERNAL_ERROR", "Failed to assign drivers", 500);
      }
    }
  }

  const { data: assignments } = await supabase
    .from("van_drivers")
    .select("driver_id")
    .eq("van_id", vanId);

  const driverIds = (assignments ?? []).map((a) => a.driver_id);

  const healthStatuses = await getTrackerHealthStatuses();
  const health = healthStatuses.find((h) => h.vanId === vanId);

  return NextResponse.json({
    van: {
      id: van.id,
      name: van.name,
      driverIds,
      ingestionToken: van.ingestion_token,
      locationUrl: van.location_url,
      locationUpdatedAt: van.location_updated_at,
      createdAt: van.created_at,
      trackerHealth: health
        ? {
            staleSinceMinutes: health.staleSinceMinutes,
            bufferSize: health.latestBufferSize,
            failureCount: health.latestFailureCount,
            batteryLevel: health.latestBatteryLevel,
            networkType: health.latestNetworkType,
            isStale: health.isStale,
            isUnhealthy: health.isUnhealthy,
          }
        : null,
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { vanId } = await params;
  const supabase = createServiceClient();

  // Check if van is assigned to a route
  const { data: routes } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", vanId)
    .limit(1);

  if (routes && routes.length > 0) {
    return apiError("CONFLICT", "Van is assigned to a route. Remove the route first.", 409);
  }

  const { data, error } = await supabase
    .from("vans")
    .delete()
    .eq("id", vanId)
    .select("id");

  if (error || !data || data.length === 0) {
    return apiError("NOT_FOUND", "Van not found", 404);
  }

  return new NextResponse(null, { status: 204 });
}
