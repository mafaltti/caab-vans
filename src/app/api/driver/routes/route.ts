import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { nowBahia, todayBahiaDate, formatTime, formatTimeString } from "@/lib/time";
import { deriveRunStatus } from "@/lib/tracking/run-status";

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

  const { data: vanDrivers } = await supabase
    .from("van_drivers")
    .select("van_id")
    .eq("driver_id", auth.user.id);

  if (!vanDrivers || vanDrivers.length === 0) {
    return NextResponse.json({
      routes: [],
      serverTime: formatTime(now),
      userId: auth.user.id,
    });
  }

  const vanIds = vanDrivers.map((vd) => vd.van_id);

  const { data: vans } = await supabase
    .from("vans")
    .select("id, name")
    .in("id", vanIds);

  const vanMap = new Map((vans ?? []).map((v) => [v.id, v.name]));

  const { data: routes } = await supabase
    .from("routes")
    .select(
      `
      id,
      name,
      van_id,
      schedule_entries (
        id,
        arrival_time,
        departure_time,
        stop_sequence
      )
    `,
    )
    .in("van_id", vanIds);

  if (!routes || routes.length === 0) {
    return NextResponse.json({
      routes: [],
      serverTime: formatTime(now),
      userId: auth.user.id,
    });
  }

  const routeIds = routes.map((r) => r.id);
  const { data: runs } = await supabase
    .from("route_runs")
    .select("id, route_id, service_date")
    .in("route_id", routeIds)
    .eq("service_date", serviceDate);

  const runByRoute = new Map(
    (runs ?? []).map((r) => [r.route_id, r]),
  );

  const runIds = (runs ?? []).map((r) => r.id);

  const shiftsByRun = new Map<string, { id: string; run_id: string; driver_id: string; started_at: string; ended_at: string | null }[]>();
  if (runIds.length > 0) {
    const { data: shifts } = await supabase
      .from("route_shifts")
      .select("id, run_id, driver_id, started_at, ended_at")
      .in("run_id", runIds)
      .order("started_at", { ascending: true });

    for (const s of shifts ?? []) {
      const arr = shiftsByRun.get(s.run_id) ?? [];
      arr.push(s);
      shiftsByRun.set(s.run_id, arr);
    }
  }

  const uniqueDriverIds = new Set<string>();
  for (const shifts of shiftsByRun.values()) {
    for (const s of shifts) {
      uniqueDriverIds.add(s.driver_id);
    }
  }

  const driverEmailMap = new Map<string, string>();
  const emailResults = await Promise.all(
    [...uniqueDriverIds].map((driverId) =>
      supabase.auth.admin.getUserById(driverId).then(({ data }) => ({
        driverId,
        email: data?.user?.email ?? null,
      })),
    ),
  );
  for (const { driverId, email } of emailResults) {
    if (email) driverEmailMap.set(driverId, email);
  }

  const result = routes.map((route) => {
    const entries = (route.schedule_entries ?? []) as { id: string; arrival_time: string; departure_time: string; stop_sequence: number }[];
    const sorted = [...entries].sort((a, b) => a.stop_sequence - b.stop_sequence);
    const sortedTimes = sorted.map((e) => e.arrival_time);
    const run = runByRoute.get(route.id);
    const shifts = run ? (shiftsByRun.get(run.id) ?? []) : [];

    const lastTime = sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : null;
    let isPastScheduleWindow = false;
    if (lastTime) {
      const [h, m] = lastTime.split(":").map(Number);
      const lastDt = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
      isPastScheduleWindow = now > lastDt;
    }

    const activeShift = shifts.find((s) => s.ended_at === null) ?? null;

    return {
      id: route.id,
      name: route.name,
      vanName: vanMap.get(route.van_id) ?? "",
      totalStops: entries.length,
      firstStopTime: sortedTimes.length > 0 ? formatTimeString(sortedTimes[0]) : null,
      lastStopTime: lastTime ? formatTimeString(lastTime) : null,
      runStatus: deriveRunStatus(shifts, isPastScheduleWindow),
      run: run
        ? { id: run.id, serviceDate: run.service_date }
        : null,
      activeShift: activeShift
        ? { id: activeShift.id, driverId: activeShift.driver_id, startedAt: activeShift.started_at }
        : null,
      todayShifts: shifts.map((s) => ({
        id: s.id,
        driverId: s.driver_id,
        driverEmail: driverEmailMap.get(s.driver_id) ?? "",
        startedAt: s.started_at,
        endedAt: s.ended_at,
      })),
    };
  });

  return NextResponse.json({
    routes: result,
    serverTime: formatTime(now),
    userId: auth.user.id,
  });
}
