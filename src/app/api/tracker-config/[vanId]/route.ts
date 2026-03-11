import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ vanId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { vanId } = await params;

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

  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", vanId)
    .single();

  if (routeError || !route) {
    return apiError("NOT_FOUND", "No route assigned to this van", 404);
  }

  const { data: entries, error: entriesError } = await supabase
    .from("schedule_entries")
    .select(
      "id, stop_name, stop_lat, stop_lng, geofence_radius_m, device_geofence_radius_m, stop_group_id, updated_at",
    )
    .eq("route_id", route.id)
    .not("stop_lat", "is", null)
    .not("stop_lng", "is", null)
    .order("stop_sequence", { ascending: true });

  if (entriesError) {
    return apiError("INTERNAL_ERROR", "Failed to load schedule entries", 500);
  }

  const seen = new Set<string>();
  const geofenceRegions: {
    placeId: string;
    lat: number;
    lng: number;
    radius: number;
  }[] = [];

  for (const entry of entries ?? []) {
    const lat = entry.stop_lat as number;
    const lng = entry.stop_lng as number;
    const key =
      entry.stop_group_id ?? `${lat.toFixed(6)},${lng.toFixed(6)}`;

    if (seen.has(key)) continue;
    seen.add(key);

    geofenceRegions.push({
      placeId: key,
      lat,
      lng,
      radius: entry.device_geofence_radius_m ?? 150,
    });
  }

  // configVersion must be the max updated_at across ALL schedule_entries on the
  // route (including ungeocoded/duplicate rows) so it matches the value returned
  // by the tracking endpoint — otherwise the tracker sees a permanent mismatch.
  const { data: versionRow } = await supabase
    .from("schedule_entries")
    .select("updated_at")
    .eq("route_id", route.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  const configVersion =
    versionRow && versionRow.length > 0
      ? versionRow[0].updated_at
      : new Date().toISOString();

  return NextResponse.json({ geofenceRegions, configVersion });
}
