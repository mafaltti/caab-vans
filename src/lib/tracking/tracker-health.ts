import { createServiceClient } from "@/lib/supabase/server";

interface TrackerHealthStatus {
  vanId: string;
  locationUpdatedAt: string | null;
  staleSinceMinutes: number | null;
  latestBufferSize: number | null;
  latestFailureCount: number | null;
  latestBatteryLevel: number | null;
  latestNetworkType: string | null;
  isStale: boolean;
  isUnhealthy: boolean;
}

export async function getTrackerHealthStatuses(
  staleThresholdMinutes = 10,
): Promise<TrackerHealthStatus[]> {
  const supabase = createServiceClient();

  // Get all vans with their latest location timestamp
  const { data: vans, error: vansError } = await supabase
    .from("vans")
    .select("id, location_updated_at");

  if (vansError || !vans) return [];

  const statuses: TrackerHealthStatus[] = [];

  for (const van of vans) {
    // Get latest ping with health metadata
    const { data: latestPing } = await supabase
      .from("van_location_pings")
      .select("buffer_size, failure_count, battery_level, network_type")
      .eq("van_id", van.id)
      .order("device_ts", { ascending: false })
      .limit(1)
      .single();

    const now = Date.now();
    const updatedAt = van.location_updated_at
      ? new Date(van.location_updated_at).getTime()
      : null;
    const staleSinceMinutes = updatedAt
      ? Math.round((now - updatedAt) / 60000)
      : null;
    const isStale =
      staleSinceMinutes !== null && staleSinceMinutes > staleThresholdMinutes;

    const bufferSize = latestPing?.buffer_size ?? null;
    const failureCount = latestPing?.failure_count ?? null;
    const isUnhealthy =
      isStale ||
      (bufferSize !== null && bufferSize > 20) ||
      (failureCount !== null && failureCount > 3);

    statuses.push({
      vanId: van.id,
      locationUpdatedAt: van.location_updated_at,
      staleSinceMinutes,
      latestBufferSize: bufferSize,
      latestFailureCount: failureCount,
      latestBatteryLevel: latestPing?.battery_level ?? null,
      latestNetworkType: latestPing?.network_type ?? null,
      isStale,
      isUnhealthy,
    });
  }

  return statuses;
}
