import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { nowBahia, todayBahiaDate, formatTime, formatTimeString } from "@/lib/time";
import type { RunStatus } from "@/types";

function deriveRunStatus(
  startedAt: string | null,
  endedAt: string | null,
): RunStatus {
  if (endedAt) return "completed";
  if (startedAt) return "in_progress";
  return "waiting";
}

export async function GET() {
  let auth;
  try {
    auth = await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  if (auth.role !== "driver") {
    return apiError("FORBIDDEN", "Driver access required", 403);
  }

  const supabase = createServiceClient();
  const now = nowBahia();
  const serviceDate = todayBahiaDate();

  const { data: vans } = await supabase
    .from("vans")
    .select("id, name")
    .eq("driver_id", auth.user.id);

  if (!vans || vans.length === 0) {
    return NextResponse.json({
      routes: [],
      serverTime: formatTime(now),
    });
  }

  const vanIds = vans.map((v) => v.id);
  const vanMap = new Map(vans.map((v) => [v.id, v.name]));

  const { data: routes } = await supabase
    .from("routes")
    .select(
      `
      id,
      name,
      van_id,
      schedule_entries (
        id,
        time
      )
    `,
    )
    .in("van_id", vanIds);

  if (!routes || routes.length === 0) {
    return NextResponse.json({
      routes: [],
      serverTime: formatTime(now),
    });
  }

  const routeIds = routes.map((r) => r.id);
  const { data: runs } = await supabase
    .from("route_runs")
    .select("id, route_id, service_date, started_at, ended_at")
    .in("route_id", routeIds)
    .eq("service_date", serviceDate);

  const runByRoute = new Map(
    (runs ?? []).map((r) => [r.route_id, r]),
  );

  const result = routes.map((route) => {
    const entries = (route.schedule_entries ?? []) as { id: string; time: string }[];
    const sortedTimes = entries.map((e) => e.time).sort();
    const run = runByRoute.get(route.id);

    return {
      id: route.id,
      name: route.name,
      vanName: vanMap.get(route.van_id) ?? "",
      totalStops: entries.length,
      firstStopTime: sortedTimes.length > 0 ? formatTimeString(sortedTimes[0]) : null,
      lastStopTime: sortedTimes.length > 0 ? formatTimeString(sortedTimes[sortedTimes.length - 1]) : null,
      run: run
        ? {
            id: run.id,
            serviceDate: run.service_date,
            status: deriveRunStatus(run.started_at, run.ended_at),
            startedAt: run.started_at,
            endedAt: run.ended_at,
          }
        : null,
    };
  });

  return NextResponse.json({
    routes: result,
    serverTime: formatTime(now),
  });
}
